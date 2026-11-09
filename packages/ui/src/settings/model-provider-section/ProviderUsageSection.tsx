import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useProviderUsage } from "@/hooks/useProviderUsage.js";
import { ProviderUsageDialog } from "./ProviderUsageDialog.js";
import { ProviderUsageSummary } from "./ProviderUsageSummary.js";

export function ProviderUsageSection({
  providerId,
  connectionKey,
  beforeQuery,
}: {
  providerId: string;
  connectionKey: string;
  beforeQuery: () => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  const usage = useProviderUsage({ providerId, connectionKey, beforeQuery });
  return (
    <div className="space-y-2" data-testid="provider-usage-section">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!usage.view}
          onClick={() => setOpen(true)}
        >
          <Settings2 className="size-3.5" />
          {intl.formatMessage({ id: "settings.providerUsage.configure" })}
        </Button>
        {usage.view?.config.enabled ? (
          <ProviderUsageSummary
            result={usage.view.result}
            loading={usage.loading}
            onRefresh={() => void usage.refresh()}
          />
        ) : null}
      </div>
      {usage.error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {usage.error}
        </p>
      ) : null}
      {open && usage.view ? (
        <ProviderUsageDialog
          providerId={providerId}
          view={usage.view}
          onClose={() => setOpen(false)}
          onSave={usage.save}
          onTest={usage.test}
          onReadSecret={usage.readSecret}
        />
      ) : null}
    </div>
  );
}
