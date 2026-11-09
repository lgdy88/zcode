import { Star } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { DefaultModelProviderActions } from "@/hooks/useDefaultModelProvider.js";

export function ProviderDefaultButton({
  providerId,
  providerName,
  actions,
}: {
  providerId?: string;
  providerName: string;
  actions?: DefaultModelProviderActions;
}) {
  const { intl } = useZCodeIntl();
  if (!actions) return null;
  if (providerId && actions.configuredProviderId === providerId) {
    return (
      <span
        data-testid={`default-provider-${providerId}`}
        className="shrink-0 text-ui-xs text-brand"
        aria-label={intl.formatMessage(
          { id: "settings.modelProvider.defaultProvider.currentLabel" },
          { name: providerName },
        )}
      >
        <span className="max-md:hidden">
          {intl.formatMessage({ id: "settings.modelProvider.defaultProvider.badge" })}
        </span>
        <Star className="hidden size-3.5 fill-current max-md:block" />
      </span>
    );
  }
  const disabled =
    !providerId ||
    !actions.ready ||
    !actions.availableProviderIds.has(providerId) ||
    actions.savingProviderId !== null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 shrink-0 px-1 text-ui-xs"
      data-testid={providerId ? `set-default-provider-${providerId}` : undefined}
      disabled={disabled}
      aria-label={intl.formatMessage(
        { id: "settings.modelProvider.defaultProvider.actionLabel" },
        { name: providerName },
      )}
      title={intl.formatMessage({
        id:
          disabled &&
          actions.ready &&
          (!providerId || !actions.availableProviderIds.has(providerId))
            ? "settings.modelProvider.defaultProvider.unavailable"
            : "settings.modelProvider.defaultProvider.action",
      })}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (providerId) void actions.saveDefault(providerId);
      }}
    >
      <span className="max-md:hidden">
        {intl.formatMessage({
          id:
            actions.savingProviderId === providerId
              ? "common.saving"
              : "settings.modelProvider.defaultProvider.action",
        })}
      </span>
      <Star className="hidden size-3.5 max-md:block" />
    </Button>
  );
}
