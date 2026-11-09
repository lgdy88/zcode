import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { ModelSelectionView } from "@zcode/services";
import { ThoughtLevelCycleControl } from "@/chat-input-toolbar/ThoughtLevelCycleControl.js";
import { ModelConfigSelect, type ModelSelectGroup } from "@/ModelConfigSelect.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ComposerProviderPicker } from "./ComposerProviderPicker.js";
import { projectProviderPicker } from "./providerSwitchProjection.js";
import type { CodingPlanEntitlementState } from "@/settings/model-provider-section/constants.js";

/**
 * RCode 形态的输入框选择器组：
 * - 供应商徽章 portal 到侧边栏槽位（平铺供应商一键切换 + 供应商配置深链）；
 * - 思考滑杆弹窗（最高/模型下拉/滑杆；内嵌当前供应商模型菜单，不显示供应商名）。
 */
export function ComposerModelPickers({
  providerId,
  view,
  entitlements,
  modelGroups,
  normalizedValue,
  triggerLabel,
  onManageModels,
  thoughtProps,
  modelProps,
}: {
  providerId?: string;
  view: ModelSelectionView | null;
  entitlements: Partial<Record<string, CodingPlanEntitlementState>>;
  modelGroups: readonly ModelSelectGroup[];
  normalizedValue: string;
  triggerLabel: string;
  onManageModels?: () => void;
  thoughtProps: {
    option: ComponentProps<typeof ThoughtLevelCycleControl>["option"];
    provider?: ComponentProps<typeof ThoughtLevelCycleControl>["provider"];
    disabled?: boolean;
    intl: ComponentProps<typeof ThoughtLevelCycleControl>["intl"];
    onValueChange: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
    triggerRef: ComponentProps<typeof ThoughtLevelCycleControl>["triggerRef"];
    open?: boolean;
    composerCollapsePriority?: number;
    restoreFocusSelector?: string | null;
    labelVisibilityClassName?: string;
    indicatorClassName?: string;
    triggerClassName?: string;
    shortcutLabel?: string;
  };
  modelProps: ComponentProps<typeof ModelConfigSelect>;
}) {
  const { intl } = useZCodeIntl();
  const projected = useMemo(
    () => projectProviderPicker(modelGroups, providerId),
    [modelGroups, providerId],
  );
  const [modelOpen, setModelOpen] = useState(false);
  const lastRequest = useRef(modelProps.openRequestKey ?? 0);
  const previousProvider = useRef(providerId);
  useEffect(() => {
    if (previousProvider.current === providerId) return;
    previousProvider.current = providerId;
    setModelOpen(false);
    thoughtProps.onOpenChange?.(false);
  }, [providerId, thoughtProps.onOpenChange]);
  useEffect(() => {
    const request = modelProps.openRequestKey ?? 0;
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    if (modelProps.disabled || !projected.modelGroups.length) return;
    thoughtProps.onOpenChange?.(true);
    setModelOpen(true);
  }, [
    modelProps.openRequestKey,
    modelProps.disabled,
    projected.modelGroups.length,
    thoughtProps.onOpenChange,
  ]);

  const providerLabel =
    projected.providerLabel ?? intl.formatMessage({ id: "chat.toolbar.provider.label" });
  // 内嵌模型菜单不显示供应商名（供应商在环形徽章菜单里切换）。
  const providerlessGroups: readonly ModelSelectGroup[] = projected.modelGroups.map((group) => ({
    ...group,
    label: "",
  }));
  const modelPicker: ReactNode = providerlessGroups.length ? (
    <ModelConfigSelect
      modelGroups={providerlessGroups}
      normalizedValue={modelProps.normalizedValue}
      triggerLabel={modelProps.triggerLabelValue ?? modelProps.triggerLabel}
      triggerTestId="composer-current-provider-model-trigger"
      shortcutLabel={modelProps.shortcutLabel}
      showProviderLevel={false}
      showManageModelsAction={false}
      lockReasonMessage={modelProps.lockReasonMessage}
      isItemLocked={modelProps.isItemLocked}
      onValueChange={modelProps.onValueChange}
      disabled={modelProps.disabled}
      labelVisibilityClassName="inline-flex"
      triggerLabelClassName="block min-w-0 truncate"
      triggerClassName="h-auto min-h-6 max-w-full justify-center px-1 py-0 text-ui-sm text-foreground-subtle"
      contentAlign="center"
      open={modelOpen}
      onOpenChange={setModelOpen}
      focusSelectorOnClose={'[data-testid="composer-current-provider-model-trigger"]'}
    />
  ) : null;

  return (
    <>
      <ComposerProviderPicker
        providerId={providerId}
        view={view}
        entitlements={entitlements}
        modelGroups={modelGroups}
        disabled={modelProps.disabled}
        lockReasonMessage={modelProps.lockReasonMessage ?? ""}
        isItemLocked={modelProps.isItemLocked ?? (() => false)}
        onValueChange={modelProps.onValueChange}
      />
      {modelPicker ? (
        <ThoughtLevelCycleControl
          {...thoughtProps}
          showModelLabelInTrigger
          modelLabel={modelProps.triggerLabelValue ?? modelProps.triggerLabel}
          emptyLabel={intl.formatMessage({ id: "chat.toolbar.model.label" })}
          onOpenChange={(open) => {
            if (!open) setModelOpen(false);
            thoughtProps.onOpenChange?.(open);
          }}
          modelPicker={modelPicker}
        />
      ) : (
        <ModelConfigSelect
          modelGroups={modelProps.modelGroups}
          normalizedValue={modelProps.normalizedValue}
          triggerLabel={modelProps.triggerLabel ?? triggerLabel}
          composerOptions={modelProps.composerOptions}
          showManageModelsAction={modelProps.showManageModelsAction}
          manageModelsLabel={modelProps.manageModelsLabel}
          onManageModels={onManageModels}
          lockReasonMessage={modelProps.lockReasonMessage}
          isItemLocked={modelProps.isItemLocked}
          onValueChange={modelProps.onValueChange}
          disabled={modelProps.disabled}
          tooltipTitle={triggerLabel}
          shortcutLabel={modelProps.shortcutLabel}
          open={modelProps.open}
          onOpenChange={modelProps.onOpenChange}
          openRequestKey={modelProps.openRequestKey}
          labelVisibilityClassName="hidden @sm/composer:inline-flex"
        />
      )}
    </>
  );
}
