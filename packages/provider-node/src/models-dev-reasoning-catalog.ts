import {
  metadataObject,
  reasoningLevels,
  unknownReasoning,
  type ModelReasoningMetadata,
} from "@zcode/provider";
import { readBoundedModelJson } from "./model-discovery-fetcher.js";

type Catalog = Record<string, unknown>;
function endpoint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}
function metadata(model: Record<string, unknown>, providerId: string): ModelReasoningMetadata {
  const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : null;
  const effort = options
    ?.filter((option) => metadataObject(option)?.type === "effort")
    .flatMap((option) => metadataObject(option)?.values ?? []);
  const levels = reasoningLevels(effort);
  const base = { source: "models-dev" as const, referenceProvider: providerId };
  if (levels) return { status: "known", ...base, control: "effort", levels };
  if (model.reasoning === false)
    return { status: "known", ...base, control: "fixed", levels: ["disabled"] };
  if (model.reasoning === true && options?.length === 0)
    return { status: "known", ...base, control: "fixed", levels: ["enabled"] };
  if (options?.some((option) => metadataObject(option)?.type === "toggle"))
    return { status: "known", ...base, control: "toggle", levels: ["disabled", "enabled"] };
  return unknownReasoning;
}

/** 不剥离别名/版本；只有目录自己声明的唯一原厂关系才能跨站补全。 */
export function resolveModelsDevReasoning(
  catalog: Catalog,
  baseUrl: string,
  modelId: string,
  ownedBy?: string,
): ModelReasoningMetadata {
  const matches: Array<{ id: string; model: Record<string, unknown> }> = [];
  const origins = new Set<string>();
  for (const [id, value] of Object.entries(catalog)) {
    const provider = metadataObject(value),
      models = metadataObject(provider?.models);
    if (!provider || !models) continue;
    const model = metadataObject(models[modelId]);
    if (model && (endpoint(provider.api) === endpoint(baseUrl) || id === ownedBy))
      matches.push({ id, model });
    for (const entry of Object.values(models)) {
      const canonical = metadataObject(entry)?.canonical_model_id;
      if (typeof canonical === "string" && canonical.includes("/"))
        origins.add(canonical.slice(0, canonical.indexOf("/")));
    }
  }
  if (matches.length === 1) return metadata(matches[0]!.model, matches[0]!.id);
  if (matches.length > 1) return unknownReasoning;
  const native: Array<{ id: string; model: Record<string, unknown> }> = [];
  for (const id of origins) {
    const models = metadataObject(metadataObject(catalog[id])?.models);
    const model = metadataObject(models?.[modelId]);
    if (model) native.push({ id, model });
  }
  return native.length === 1 ? metadata(native[0]!.model, native[0]!.id) : unknownReasoning;
}

/** 单飞缓存仅保存公共目录；供应商 headers/Key 不进入这个请求。 */
export function createModelsDevReasoningCatalog(
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): () => Promise<Catalog> {
  let pending: Promise<Catalog> | undefined,
    expires = 0;
  return () => {
    if (pending && now() < expires) return pending;
    expires = now() + 60 * 60 * 1000;
    pending = (async () => {
      const response = await fetchImpl("https://models.dev/api.json", {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Model capability catalog unavailable");
      }
      const value = metadataObject(await readBoundedModelJson(response, 32 * 1024 * 1024));
      if (!value) throw new Error("Invalid model capability catalog");
      return value;
    })();
    void pending.catch(() => {
      pending = undefined;
    });
    return pending;
  };
}
