import { isIP } from "node:net";
import {
  isApiKeyAccess,
  type ProviderConfigObject,
  type ProviderUsageConfig,
  type ProviderUsageResult,
  type ProviderUsageErrorCode,
} from "@zcode/provider";
import type { UsageStoredEntry } from "./providerUsageStore.js";
import { parseProviderUsage, validateUsageItems, usageObject } from "./providerUsageParsing.js";
import { signVolcengineUsage } from "./providerUsageVolcengine.js";

export class UsageQueryError extends Error {
  constructor(
    readonly code: ProviderUsageErrorCode,
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}
export function validateUsageUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageQueryError("invalid-url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new UsageQueryError("invalid-url");
  }
  const loopback = host === "localhost" || host === "::1" || host.startsWith("127.");
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    host === "0.0.0.0" ||
    host === "::" ||
    host.startsWith("169.254.") ||
    host.startsWith("fe80:") ||
    host.startsWith("::ffff:a9fe:") ||
    host === "fd00:ec2::254" ||
    host === "metadata.google.internal" ||
    host === "100.100.100.200" ||
    (isIP(host) === 4 && host.startsWith("224.")) ||
    /\{\{(?:apiKey|accessToken|secretKey)\}\}/i.test(decoded)
  )
    throw new UsageQueryError("invalid-url");
  return url;
}
async function readUsageJson(response: Response): Promise<unknown> {
  const limit = 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new UsageQueryError("too-large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new UsageQueryError("invalid-response");
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > limit) throw new UsageQueryError("too-large");
      parts.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new UsageQueryError("invalid-response");
  }
}
function endpoint(config: ProviderUsageConfig, base: URL): URL {
  const original = new URL(base);
  const root = (path: string) => new URL(path, base.origin);
  switch (config.template) {
    case "custom":
      if (!config.custom?.path) throw new UsageQueryError("invalid-config");
      return validateUsageUrl(
        new URL(config.custom.path, `${base.href.replace(/\/+$/, "")}/`).href,
      );
    case "general":
      base.pathname = base.pathname.replace(/\/+$/, "") + "/user/balance";
      return base;
    case "new-api":
      return root("/api/user/self");
    case "sub2api":
      base.pathname = base.pathname.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/usage";
      return base;
    case "balance":
      switch (config.balanceProvider) {
        case "deepseek":
          return root("/user/balance");
        case "stepfun":
          return root("/v1/accounts");
        case "siliconflow":
          return root("/v1/user/info");
        case "openrouter":
          return root("/api/v1/credits");
        case "novita":
          return root("/v3/user/balance");
      }
      break;
    case "token-plan":
      switch (config.tokenPlanProvider) {
        case "kimi":
          return root("/coding/v1/usages");
        case "zhipu":
          return root("/api/monitor/usage/quota/limit");
        case "zhipu-team":
          return root("/api/monitor/usage/quota/limit?type=2");
        case "minimax":
          if (["api.minimaxi.com", "api.minimax.cn"].includes(base.hostname))
            return new URL("https://www.minimaxi.com/v1/token_plan/remains");
          return root("/v1/api/openplatform/coding_plan/remains");
        case "zenmux":
          if (!config.baseUrl) throw new UsageQueryError("invalid-config");
          return original;
        case "opencode-go":
          return root("/zen/go/v1/usage");
        case "command-code":
          return root("/alpha/billing/credits");
      }
      break;
  }
  throw new UsageQueryError("invalid-config");
}
export async function executeProviderUsageQuery(input: {
  provider: ProviderConfigObject;
  entry: UsageStoredEntry;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<ProviderUsageResult> {
  const now = Date.now();
  const { config } = input.entry;
  const fail = (code: ProviderUsageErrorCode, httpStatus?: number): ProviderUsageResult => ({
    status: "error",
    code,
    httpStatus,
    queriedAt: now,
  });
  if (!config.enabled) return fail("disabled");
  try {
    const providerBase = validateUsageUrl(input.provider.api?.baseUrl ?? "");
    const base = validateUsageUrl(config.baseUrl?.trim() || providerBase.href);
    const apiKey = isApiKeyAccess(input.provider.access) ? input.provider.access.apiKey : undefined;
    const usesProviderKey = !input.entry.accessToken;
    const key = input.entry.accessToken || apiKey;
    const timeout = AbortSignal.timeout(config.timeoutSeconds * 1000);
    const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;
    let url: URL,
      headers: Headers,
      method = "GET",
      body: string | undefined;
    const volc = config.template === "token-plan" && config.tokenPlanProvider === "volcengine";
    if (volc) {
      if (!config.accessKeyId || !input.entry.secretKey)
        throw new UsageQueryError("missing-credentials");
      const signed = signVolcengineUsage({
        accessKeyId: config.accessKeyId,
        secretKey: input.entry.secretKey,
        region: config.region ?? "cn-beijing",
        planKind: config.planKind ?? "coding",
      });
      url = new URL(signed.url);
      headers = new Headers(signed.headers);
      method = "POST";
      body = signed.body;
    } else {
      if (!key || (config.template === "new-api" && !input.entry.accessToken))
        throw new UsageQueryError("missing-credentials");
      url = endpoint(config, base);
      const minimaxLegacy =
        config.template === "token-plan" &&
        config.tokenPlanProvider === "minimax" &&
        ["api.minimaxi.com", "api.minimax.cn"].includes(providerBase.hostname) &&
        url.origin === "https://www.minimaxi.com";
      // 独立查询 Token 的作用域是用户明确配置的 Base URL；继承 Key 严格限制在原目的地。
      if (
        (url.origin !== base.origin && !minimaxLegacy) ||
        (usesProviderKey && url.origin !== providerBase.origin && !minimaxLegacy)
      )
        throw new UsageQueryError("cross-origin");
      headers = new Headers({ Accept: "application/json" });
      if (url.origin === providerBase.origin)
        for (const [name, value] of Object.entries(input.provider.api?.headers ?? {}))
          headers.set(name, value);
      headers.set(
        "Authorization",
        config.template === "token-plan" &&
          ["zhipu", "zhipu-team"].includes(config.tokenPlanProvider ?? "")
          ? key
          : `Bearer ${key}`,
      );
      // xiavier 实测仅账户 Token 即可查询；User ID 是否必需由供应商判断，不能在本地拦截。
      if (config.template === "new-api" && config.userId?.trim())
        headers.set("New-Api-User", config.userId.trim());
      if (config.template === "token-plan" && config.tokenPlanProvider === "zhipu-team") {
        if (!config.organizationId || !config.projectId)
          throw new UsageQueryError("invalid-config");
        headers.set("bigmodel-organization", config.organizationId);
        headers.set("bigmodel-project", config.projectId);
      }
      if (config.template === "custom") {
        const custom = config.custom!;
        method = custom.method;
        const replace = (text: string) =>
          text
            .replaceAll("{{apiKey}}", key)
            .replaceAll("{{accessToken}}", input.entry.accessToken ?? "")
            .replaceAll("{{userId}}", config.userId ?? "");
        for (const [name, value] of Object.entries(custom.headers))
          headers.set(name, replace(value));
        if (method === "POST") {
          body = replace(custom.body ?? "");
          headers.set("Content-Type", "application/json");
        }
      }
    }
    validateUsageUrl(url.href);
    if (
      [key, input.entry.secretKey, apiKey].some(
        (secret) =>
          secret && (url.href.includes(secret) || url.href.includes(encodeURIComponent(secret))),
      )
    )
      throw new UsageQueryError("invalid-url");
    const request = async (target: URL) => {
      const response = await input.fetchImpl(target, {
        method,
        headers,
        body,
        redirect: "manual",
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new UsageQueryError(
          [401, 403].includes(response.status) ? "auth" : "http",
          response.status,
        );
      }
      return readUsageJson(response);
    };
    if (config.template === "token-plan" && config.tokenPlanProvider === "command-code") {
      let orgId = config.organizationId;
      if (!orgId) {
        const who = usageObject(await request(new URL("/alpha/whoami?limits=1", url.origin)));
        const org = usageObject(who.org);
        if (typeof org.id === "string") orgId = org.id;
      }
      if (orgId) url.searchParams.set("orgId", orgId);
    }
    const response = await request(url);
    let items;
    try {
      // 解析币种等站点差异时必须使用最终查询地址，不能只看可选的覆盖输入。
      items = validateUsageItems(parseProviderUsage({ ...config, baseUrl: url.href }, response));
    } catch (error) {
      throw new UsageQueryError(
        error instanceof Error && error.message === "business" ? "business" : "invalid-response",
      );
    }
    const secrets = [
      key,
      input.entry.secretKey,
      ...Object.values(input.provider.api?.headers ?? {}),
    ].filter((v): v is string => Boolean(v));
    if (secrets.some((secret) => JSON.stringify(items).includes(secret)))
      throw new UsageQueryError("invalid-response");
    return { status: "ok", items, queriedAt: Date.now() };
  } catch (error) {
    if (error instanceof UsageQueryError) return fail(error.code, error.httpStatus);
    return fail(
      error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "timeout"
        : "network",
    );
  }
}
