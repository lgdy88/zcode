import type { ModelSelectGroup } from "@/ModelConfigSelect.js";
import type { ModelSelectionView } from "@zcode/services";
import { decodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

/** 修改思考强度不能丢失 Auto 意图，也不能清掉其他已选择选项。 */
export function updateModelReasoningLevel(
  selection: { providerId: string; modelId: string; options?: { reasoningLevel?: string } },
  thought: string,
) {
  const options = { ...selection.options };
  const reasoningLevel = thought.trim();
  if (reasoningLevel) options.reasoningLevel = reasoningLevel;
  else delete options.reasoningLevel;
  return { ...selection, options: Object.keys(options).length ? options : undefined };
}

// 仅菜单 value 编码，不是模型 ID；提交前转换为该供应商的默认可执行模型。
const AUTO_VALUE_PREFIX = "zcode-auto:";
export function encodeAutoModelValue(providerId: string): string {
  return `${AUTO_VALUE_PREFIX}${encodeURIComponent(providerId)}`;
}
export function decodeAutoModelValue(value: string): string | undefined {
  return value.startsWith(AUTO_VALUE_PREFIX)
    ? decodeURIComponent(value.slice(AUTO_VALUE_PREFIX.length))
    : undefined;
}

/** 每个供应商分组顶部插入 Auto 项（自动择优）；无可用模型的分组不加。 */
export function addAutoModelItems(
  groups: ModelSelectGroup[],
  view: ModelSelectionView,
  badgeLabel: string,
): ModelSelectGroup[] {
  return groups.map((group) => {
    const providerId = decodeCustomModelValue(group.items[0]?.value ?? "")?.providerId;
    if (
      !providerId ||
      !view.providers.some(
        (provider) => provider.providerId === providerId && provider.models.length,
      )
    )
      return group;
    return {
      ...group,
      items: [
        {
          key: `auto:${providerId}`,
          value: encodeAutoModelValue(providerId),
          name: "Auto",
          badgeLabel,
        },
        ...group.items,
      ],
    };
  });
}
