import type { ModelConfigObject, ProviderApiType } from "./config/index.js";

export type ModelReasoningMetadata =
  | {
      readonly status: "known";
      readonly source: "provider" | "models-dev" | "builtin";
      readonly control: "effort" | "toggle" | "fixed";
      readonly levels: readonly string[];
      readonly adaptive?: boolean;
      readonly referenceProvider?: string;
    }
  | { readonly status: "unknown"; readonly source: "unknown"; readonly referenceBlocked?: boolean };

export const unknownReasoning: ModelReasoningMetadata = { status: "unknown", source: "unknown" };
export function metadataObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const ORDER = [
  "none",
  "disabled",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "enabled",
];
export function reasoningLevels(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 32) return null;
  if (
    !value.every((item) => typeof item === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(item))
  )
    return null;
  return [...new Set(value as string[])].sort((a, b) => {
    const x = ORDER.indexOf(a.toLowerCase()),
      y = ORDER.indexOf(b.toLowerCase());
    return x < 0 || y < 0 ? 0 : x - y;
  });
}

/** 只消费明确声明的档位；supported_parameters 与 thinking.supported 不能冒充档位列表。 */
export function providerReasoningMetadata(row: Record<string, unknown>): ModelReasoningMetadata {
  const list = row.supported_reasoning_levels;
  if (Array.isArray(list)) {
    const levels = reasoningLevels(
      list.map((item) => (typeof item === "string" ? item : metadataObject(item)?.effort)),
    );
    if (levels) return { status: "known", source: "provider", control: "effort", levels };
  }
  const options = row.reasoning_options;
  if (Array.isArray(options)) {
    const effort = options
      .filter((item) => metadataObject(item)?.type === "effort")
      .flatMap((item) => metadataObject(item)?.values ?? []);
    const levels = reasoningLevels(effort);
    if (levels) return { status: "known", source: "provider", control: "effort", levels };
  }
  const capabilities = metadataObject(row.capabilities);
  const effort = metadataObject(capabilities?.effort);
  if (effort?.supported === false)
    return { status: "unknown", source: "unknown", referenceBlocked: true };
  if (effort?.supported === true) {
    const levels = reasoningLevels(
      ORDER.filter((key) => metadataObject(effort[key])?.supported === true),
    );
    if (levels) {
      const thinking = metadataObject(capabilities?.thinking);
      const types = metadataObject(thinking?.types);
      return {
        status: "known",
        source: "provider",
        control: "effort",
        levels,
        ...(metadataObject(types?.adaptive)?.supported === true ? { adaptive: true } : {}),
      };
    }
  }
  if (row.reasoning === false)
    return { status: "known", source: "provider", control: "fixed", levels: ["disabled"] };
  return unknownReasoning;
}

type ReasoningSpec = NonNullable<NonNullable<ModelConfigObject["optionSpecs"]>["reasoningLevel"]>;
export function isGenericReasoning(spec: ReasoningSpec | null | undefined): boolean {
  return (
    !spec ||
    (spec.values?.length === 2 &&
      spec.values.includes("disabled") &&
      spec.values.includes("enabled"))
  );
}

/** values/map 同时生成，映射代码只来自本地协议实现，不执行远端字段。 */
export function compileReasoningMetadata(
  metadata: ModelReasoningMetadata,
  apiType: ProviderApiType,
  inherited?: ReasoningSpec | null,
): ReasoningSpec | null {
  if (metadata.status === "unknown")
    return metadata.referenceBlocked || isGenericReasoning(inherited) ? null : inherited!;
  if (metadata.source === "builtin") return inherited ?? null;
  if (metadata.control === "fixed") return { values: metadata.levels, map: "{}" };
  if (metadata.control !== "effort")
    return inherited?.map && inherited.map.trim() !== "{}"
      ? { ...inherited, values: metadata.levels }
      : null;
  // 目录补全保留已经核对的 thinking/budget 等专用映射；供应商明确声明则按当前协议生成。
  if (metadata.source === "models-dev" && inherited?.map && inherited.map.trim() !== "{}")
    return { ...inherited, values: metadata.levels };
  const map =
    apiType === "openai-responses"
      ? '{"reasoning":{"effort":reasoningLevel}}'
      : apiType === "openai-chat-completions"
        ? '{"reasoning_effort":reasoningLevel}'
        : metadata.adaptive
          ? '{"thinking":{"type":"adaptive"},"output_config":{"effort":reasoningLevel}}'
          : '{"output_config":{"effort":reasoningLevel}}';
  return { values: metadata.levels, map };
}
