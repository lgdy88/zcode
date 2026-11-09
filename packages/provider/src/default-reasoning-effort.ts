import { z } from "zod";

export const defaultReasoningEffortSchema = z.enum(["fast", "balanced", "deep", "maximum"]);
export type DefaultReasoningEffort = z.infer<typeof defaultReasoningEffortSchema>;

/** 模型的有序档位是能力事实；通用偏好只选择现有值，不制造供应商不支持的参数。 */
export function resolveDefaultReasoningLevel(
  values: readonly string[],
  effort: DefaultReasoningEffort = "balanced",
): string | undefined {
  if (values.length < 2) return values[0];
  // 快速也不擅自关闭思考；用户仍可在会话中显式选择 off/none。
  const active = values.filter(
    (value) => !["off", "none", "disabled", "false", "0"].includes(value.toLowerCase()),
  );
  const levels = active.length ? active : values;
  if (effort === "fast") return levels[0];
  if (effort === "maximum") return levels.at(-1);
  const native = levels.find(
    (value) => value.toLowerCase() === (effort === "balanced" ? "medium" : "high"),
  );
  if (native) return native;
  return levels[
    effort === "balanced"
      ? Math.floor((levels.length - 1) / 2)
      : Math.round((levels.length - 1) * 0.75)
  ];
}
