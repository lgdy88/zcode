import type { ModelSelectionView } from "@zcode/services";
import { completeNewModelSelection, validateModelSelectionOptions } from "@zcode/provider";

/**
 * 解析某供应商下第一个可执行的默认选择，供侧边栏供应商徽章一键切换使用。
 * 优先当前全局偏好（若属于该供应商），否则按目录序回落到首个可执行模型。
 */
export function resolveDefaultProviderSelection(
  view: ModelSelectionView | null,
  providerId: string,
) {
  const provider = view?.providers.find((item) => item.providerId === providerId);
  if (!view || !provider) {
    return undefined;
  }
  const preferred = view.preferredSelection;
  if (preferred && preferred.providerId === providerId) {
    const model = provider.models.find((item) => item.modelId === preferred.modelId);
    // 保存的档位也须可执行；只检查名称会把必然失败的动作呈现为可用。
    return model && validateModelSelectionOptions(model, preferred).ok ? preferred : undefined;
  }
  for (const model of provider.models) {
    const selection = completeNewModelSelection(view, {
      providerId,
      modelId: model.modelId,
    });
    if (selection) {
      return selection;
    }
  }
  return undefined;
}
