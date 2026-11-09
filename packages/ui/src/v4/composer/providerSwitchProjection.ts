import type { ModelSelectionView } from "@zcode/services";
import { decodeCustomModelValue, encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";
import { resolveDefaultProviderSelection } from "@/lib/provider/defaultModelProvider.js";
import type { ModelSelectGroup, ModelSelectGroupItem } from "@/ModelConfigSelect.js";

/** 只改变入口的投影；可用模型仍全部来自目标 Host 的现有目录。 */
export function projectProviderPicker(
  groups: readonly ModelSelectGroup[],
  providerId?: string,
) {
  const providerItems: ModelSelectGroupItem[] = [];
  let current: ModelSelectGroup | undefined;
  for (const group of groups) {
    const identity = group.items
      .map((item) => decodeCustomModelValue(item.value)?.providerId)
      .find(Boolean);
    if (!identity) {
      continue;
    }
    providerItems.push({
      key: group.key,
      value: identity,
      name: group.label,
      ...(group.labelBadge ? { badgeLabel: group.labelBadge } : {}),
    });
    if (identity === providerId) {
      current = group;
    }
  }
  return {
    providerItems,
    providerLabel: current?.label,
    providerBadge: current?.labelBadge,
    modelGroups: current ? [{ ...current, directItems: false }] : [],
  };
}

/**
 * 徽章菜单点击供应商项 → 折算成该供应商的默认可执行模型值。
 * 返回 null 表示该供应商当前无可执行模型（菜单项置灰）。
 */
export function providerSwitchModelValue(
  view: ModelSelectionView | null,
  providerId: string,
): string | null {
  const selection = resolveDefaultProviderSelection(view, providerId);
  if (!selection) {
    return null;
  }
  return encodeCustomModelValue(providerId, selection.modelId);
}
