import { isApiKeyAccess, type ProviderConfigObject } from "@zcode/provider";
import type {
  DiscoveredProviderModel,
  ProviderModelDiscoveryErrorCode,
  ProviderModelDiscoveryFetcher,
  ProviderModelDiscoveryResult,
} from "@zcode/provider";
import { providerReasoningMetadata } from "@zcode/provider";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 100;
const failure = (code: ProviderModelDiscoveryErrorCode): ProviderModelDiscoveryResult => ({
  success: false,
  error: { code },
});

function modelsUrl(baseUrl: string): URL | null {
  try {
    const url = new URL(baseUrl.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = `${path}${/\/v\d+$/.test(path) ? "" : "/v1"}/models`;
    return url;
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePage(
  value: unknown,
  secrets: readonly string[],
): {
  models: DiscoveredProviderModel[];
  hasMore: boolean;
  cursor?: string;
} | null {
  const page = object(value);
  if (!page) return null;
  const catalog = page.data === undefined;
  const entries = catalog ? page.models : page.data;
  if (!Array.isArray(entries)) return null;
  const models: DiscoveredProviderModel[] = [];
  for (const entry of entries) {
    const row = object(entry);
    const id = row && (catalog ? (row.slug ?? row.id) : row.id);
    if (typeof id !== "string" || !id.trim()) return null;
    const reasoning = providerReasoningMetadata(row!);
    const projected = { id, ownedBy: row?.owned_by, reasoning };
    if (secrets.some((secret) => secret && JSON.stringify(projected).includes(secret))) return null;
    models.push({
      id: id.trim(),
      ...(typeof row?.owned_by === "string" && row.owned_by.trim()
        ? { ownedBy: row.owned_by.trim() }
        : {}),
      ...(reasoning.status === "known" || reasoning.referenceBlocked ? { reasoning } : {}),
    });
  }
  if (page.has_more !== undefined && typeof page.has_more !== "boolean") return null;
  return {
    models,
    hasMore: page.has_more === true,
    ...(typeof page.last_id === "string" && page.last_id ? { cursor: page.last_id } : {}),
  };
}

export async function readBoundedModelJson(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new RangeError();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new RangeError();
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function requestHeaders(config: ProviderConfigObject, apiKey: string): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (config.api?.type === "anthropic-messages") {
    headers.set("x-api-key", apiKey);
    headers.set("anthropic-version", "2023-06-01");
  } else {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  for (const [name, value] of Object.entries(config.api?.headers ?? {})) headers.set(name, value);
  return headers;
}

/** Host 统一网络出口；只读当前配置目的地，错误回执不携带远端正文或凭据。 */
export function createProviderModelDiscoveryFetcher(
  fetchImpl: typeof fetch,
): ProviderModelDiscoveryFetcher {
  return async (config) => {
    if (!isApiKeyAccess(config.access)) return failure("unsupported-provider");
    if (!config.api?.baseUrl?.trim()) return failure("missing-url");
    const endpoint = modelsUrl(config.api.baseUrl);
    if (!endpoint) return failure("invalid-url");
    const apiKey = config.access.apiKey?.trim();
    if (!apiKey) return failure("missing-key");
    const signal = AbortSignal.timeout(15_000);
    try {
      const headers = requestHeaders(config, apiKey);
      const all = new Map<string, DiscoveredProviderModel>();
      const cursors = new Set<string>();
      for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
        // 禁止重定向：模型目录请求会携带 Key，不能跟随站点跳转将它传给其他目标。
        const response = await fetchImpl(endpoint, {
          method: "GET",
          headers,
          redirect: "error",
          signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return failure(
            response.status === 401 || response.status === 403
              ? "auth"
              : response.status === 404 || response.status === 405
                ? "not-supported"
                : "http",
          );
        }
        const page = parsePage(await readBoundedModelJson(response), [
          apiKey,
          ...Object.values(config.api.headers ?? {}),
        ]);
        if (!page) return failure("invalid-response");
        for (const model of page.models) if (!all.has(model.id)) all.set(model.id, model);
        if (!page.hasMore)
          return {
            success: true,
            models: [...all.values()].sort((a, b) => a.id.localeCompare(b.id)),
          };
        if (!page.cursor || cursors.has(page.cursor)) return failure("invalid-response");
        cursors.add(page.cursor);
        endpoint.searchParams.set("after_id", page.cursor);
      }
      return failure("too-large");
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "TimeoutError"))
        return failure("timeout");
      if (error instanceof RangeError) return failure("too-large");
      if (error instanceof SyntaxError) return failure("invalid-response");
      return failure("network");
    }
  };
}
