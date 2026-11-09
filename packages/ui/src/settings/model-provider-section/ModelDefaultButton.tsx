import { Star } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useDefaultModelActions } from "./DefaultModelActionsContext.js";

export function ModelDefaultButton({
  providerId,
  modelId,
  enabled,
}: {
  providerId: string;
  modelId: string;
  enabled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const actions = useDefaultModelActions();
  if (!actions || !enabled) return null;
  const current = actions.providerDefaults[providerId]?.modelId === modelId;
  if (current)
    return (
      <span
        data-testid={`default-model-${providerId}-${modelId}`}
        className="shrink-0 text-ui-xs text-brand"
        aria-label={intl.formatMessage(
          { id: "settings.modelProvider.defaultModel.currentLabel" },
          { name: modelId },
        )}
      >
        {intl.formatMessage({ id: "settings.modelProvider.defaultProvider.badge" })}
      </span>
    );
  const available = actions.availableModels.has(JSON.stringify([providerId, modelId]));
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 shrink-0 px-1 text-ui-xs opacity-0 group-hover/model:opacity-100 group-focus-within/model:opacity-100 max-md:size-7 max-md:p-0 max-md:opacity-100"
      data-testid={`set-default-model-${providerId}-${modelId}`}
      disabled={!actions.ready || !available || actions.savingProviderId !== null}
      aria-label={intl.formatMessage(
        { id: "settings.modelProvider.defaultModel.actionLabel" },
        { name: modelId },
      )}
      title={intl.formatMessage({
        id: available
          ? "settings.modelProvider.defaultProvider.action"
          : "settings.modelProvider.defaultProvider.unavailable",
      })}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void actions.saveModelDefault(providerId, modelId);
      }}
    >
      <span className="max-md:hidden">
        {intl.formatMessage({ id: "settings.modelProvider.defaultProvider.action" })}
      </span>
      <Star className="hidden size-3.5 max-md:block" />
    </Button>
  );
}
