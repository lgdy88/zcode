import { useCallback, useMemo, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { isApiKeyAccess } from "@zcode/provider";
import type { ModelSelectionView } from "@zcode/services";
import { ModelConfigSelect, type ModelSelectGroup } from "@/ModelConfigSelect.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { useProviderUsage } from "@/hooks/useProviderUsage.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import type { CodingPlanEntitlementState } from "@/settings/model-provider-section/constants.js";
import { useSidebarProviderSlotElement } from "@/app-shell/SidebarProviderSlotStore.js";
import { accountProviderUsageResult, ProviderUsageRings } from "./ComposerProviderUsage.js";
import { projectProviderPicker, providerSwitchModelValue } from "./providerSwitchProjection.js";

/**
 * 侧边栏供应商徽章（RCode 形态）：平铺供应商列表一键切换，
 * 底部「供应商配置」深链设置页。选择与权益仍由原 owner（composer 工具栏）持有。
 */
export function ComposerProviderPicker(props: {
  providerId?: string;
  view: ModelSelectionView | null;
  entitlements: Partial<Record<string, CodingPlanEntitlementState>>;
  modelGroups: readonly ModelSelectGroup[];
  disabled?: boolean;
  lockReasonMessage: string;
  isItemLocked: (candidateValue: string) => boolean;
  onValueChange: (value: string, reasoningLevel?: string) => void;
}) {
  const slot = useSidebarProviderSlotElement();
  if (!slot) {
    return null;
  }
  return createPortal(<ProviderPickerControl {...props} />, slot);
}

function ProviderPickerControl({
  providerId,
  view,
  entitlements,
  modelGroups,
  disabled,
  lockReasonMessage,
  isItemLocked,
  onValueChange,
}: Parameters<typeof ComposerProviderPicker>[0]) {
  const { intl } = useZCodeIntl();
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const projected = useMemo(
    () => projectProviderPicker(modelGroups, providerId),
    [modelGroups, providerId],
  );
  const provider = view?.providers.find((candidate) => candidate.providerId === providerId);
  const apiKeyAccess = isApiKeyAccess(provider?.config.access);
  // 自定义 Key：Host 持有自动查询与凭据，UI 只订阅（用量配置在设置页用量查询区）。
  const usage = useProviderUsage({
    providerId: providerId ?? "",
    connectionKey: String(view?.revision ?? ""),
    beforeQuery: async () => {},
  });
  const result = apiKeyAccess
    ? usage.view?.config.enabled
      ? usage.view.result
      : undefined
    : accountProviderUsageResult(entitlements[providerId ?? ""]?.snapshot);
  const providerLabel =
    projected.providerLabel ?? intl.formatMessage({ id: "chat.toolbar.provider.label" });
  const handleConfigure = useCallback(() => {
    setPendingSettingsSectionIntent("modelProvider");
    openSettingsTab();
  }, [openSettingsTab]);
  const ring = (
    <ProviderUsageRings
      result={result}
      showWeekly={!apiKeyAccess || usage.view?.config.template === "token-plan"}
    />
  );
  // 上游 tooltipTitle 是纯字符串；原生 title 按\n分行：
  // 第一行供应商名，下面每档额度一行；仅余额的供应商第二行直接给余额。
  const tooltip = [
    providerLabel + (projected.providerBadge ? ` · ${projected.providerBadge}` : ""),
    ...(result?.status === "ok"
      ? result.items.map((item) => {
          const label =
            item.label === "five_hour"
              ? intl.formatMessage({ id: "chat.toolbar.provider.ring.fiveHour" })
              : item.label === "weekly"
                ? intl.formatMessage({ id: "chat.toolbar.provider.ring.weekly" })
                : (item.label ?? "");
          if (item.remainingPercent !== undefined)
            return `${label} ${Math.round(item.remainingPercent)}%`;
          if (item.remaining !== undefined)
            return `${intl.formatMessage({ id: "chat.toolbar.provider.balance" })} ${item.remaining}${item.unit ?? ""}`;
          return label;
        })
      : []),
  ].join("\n");
  return (
    <ModelConfigSelect
      triggerTestId="activity-provider-trigger"
      triggerClassName="size-9 justify-center rounded-full p-0"
      triggerBadge={ring}
      triggerIconClassName="hidden"
      triggerLabelClassName="hidden"
      indicatorClassName="hidden"
      contentSide="right"
      contentAlign="end"
      modelGroups={[
        { key: "composer-providers", label: "", items: projected.providerItems },
      ]}
      normalizedValue={providerId ?? ""}
      triggerLabel={providerLabel}
      triggerLabelValue={providerLabel}
      tooltipTitle={tooltip}
      showManageModelsAction={false}
      showProviderLevel={false}
      footerActions={[
        {
          key: "provider-configure",
          label: intl.formatMessage({ id: "chat.toolbar.provider.configure" }),
          onSelect: handleConfigure,
        },
      ]}
      disabled={disabled}
      lockReasonMessage={lockReasonMessage}
      isItemLocked={(id) => providerSwitchModelValue(view, id) === null || isItemLocked(id)}
      onValueChange={(id) => {
        const value = providerSwitchModelValue(view, id);
        if (value) {
          onValueChange(value);
        }
      }}
    />
  );
}
