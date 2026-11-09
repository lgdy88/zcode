import { useMemo, useState } from "react";
import { Check, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useProviderModelDiscovery } from "@/hooks/useProviderModelDiscovery.js";
import type {
  DiscoveredProviderModel,
  ModelReasoningMetadata,
} from "@zcode/provider";

export function ProviderModelDiscoveryButton({
  providerId,
  providerName,
  connectionKey,
  existingModelIds,
  beforeFetch,
  onSelectModels,
}: {
  providerId: string;
  providerName?: string;
  /** 仅用于当前表单内比较，不输出 DOM/日志或传给远端。 */
  connectionKey: string;
  existingModelIds: readonly string[];
  beforeFetch?: () => Promise<void>;
  /** 确认后批量添加；按选择顺序去重提交，附发现到的思考档位元数据。 */
  onSelectModels?: (
    ids: string[],
    metadata: Readonly<Record<string, ModelReasoningMetadata | undefined>>,
  ) => void | Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const discovery = useProviderModelDiscovery({ providerId, connectionKey, beforeFetch });
  const [selected, setSelected] = useState<readonly string[]>([]);
  const existing = new Set(existingModelIds);
  const groups = useMemo(() => {
    const grouped = new Map<string, DiscoveredProviderModel[]>();
    if (discovery.result?.success)
      for (const model of discovery.result.models) {
        const group = model.ownedBy ?? providerName ?? providerId;
        const models = grouped.get(group) ?? [];
        models.push(model);
        grouped.set(group, models);
      }
    return [...grouped];
  }, [discovery.result, providerName, providerId]);
  const message = (suffix: string) =>
    intl.formatMessage({ id: `settings.modelProvider.discovery.${suffix}` });
  const resetSelection = () => setSelected([]);
  const close = (next: boolean) => {
    discovery.onOpenChange(next);
    if (!next) resetSelection();
  };
  const toggle = (id: string) => {
    if (existing.has(id)) return;
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };
  const confirm = () => {
    if (!selected.length || !onSelectModels) return;
    const modelsById = new Map(
      (discovery.result?.success ? discovery.result.models : []).map((model) => [model.id, model]),
    );
    const metadata = Object.fromEntries(
      selected.map((id) => [id, modelsById.get(id)?.reasoning]),
    );
    void Promise.resolve(onSelectModels([...selected], metadata)).finally(() => close(false));
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={discovery.loading}
        data-testid="model-provider-fetch-models-button"
        onClick={() => void discovery.fetchModels()}
      >
        {discovery.loading ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        {message(discovery.loading ? "loading" : "fetch")}
      </Button>
      <Dialog open={discovery.open} onOpenChange={close}>
        <DialogContent
          className="gap-3 p-4 sm:max-w-lg"
          data-testid="model-provider-discovery-dialog"
        >
          <DialogHeader className="pr-7">
            <DialogTitle>{message("title")}</DialogTitle>
            <DialogDescription>
              {onSelectModels
                ? intl.formatMessage(
                    { id: "settings.modelProvider.discovery.description" },
                    { provider: providerName ?? providerId },
                  )
                : `${providerName ?? providerId} · ${message("title")}`}
            </DialogDescription>
          </DialogHeader>
          {discovery.result?.success ? (
            <p className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage(
                { id: "settings.modelProvider.discovery.reasoningSummary" },
                {
                  count: discovery.result.models.filter(
                    (model) => model.reasoning?.status === "known",
                  ).length,
                },
              )}
            </p>
          ) : null}
          {discovery.loading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-8 text-ui-base text-foreground-subtle"
            >
              <LoaderCircle className="size-4 animate-spin" />
              {message("loading")}
            </div>
          ) : discovery.result && !discovery.result.success ? (
            <div className="space-y-3">
              <p role="alert" className="text-ui-base text-destructive">
                {message(`error.${discovery.result.error.code}`)}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void discovery.fetchModels()}
              >
                {message("retry")}
              </Button>
            </div>
          ) : discovery.result?.success && discovery.result.models.length === 0 ? (
            <p role="status" className="py-8 text-center text-ui-base text-foreground-subtle">
              {message("empty")}
            </p>
          ) : (
            <>
              <Command>
                <CommandInput
                  autoFocus
                  placeholder={message("search")}
                  aria-label={message("search")}
                />
                <CommandList className="max-h-80" aria-label={message("title")}>
                  <CommandEmpty>{message("noMatches")}</CommandEmpty>
                  {groups.map(([group, models]) => (
                    <CommandGroup key={group} heading={group}>
                      {models.map((model) => {
                        const added = existing.has(model.id);
                        const checked = selected.includes(model.id);
                        return (
                          <CommandItem
                            key={model.id}
                            value={model.id}
                            disabled={added || !onSelectModels}
                            onSelect={() => toggle(model.id)}
                          >
                            {checked ? (
                              <Check className="shrink-0 size-4 text-foreground" aria-hidden />
                            ) : (
                              <span className="inline-block size-4 shrink-0" aria-hidden />
                            )}
                            <span className="min-w-0 break-all font-mono">{model.id}</span>
                            {model.reasoning ? (
                              <span
                                className="shrink-0 rounded bg-surface px-1 py-0.5 text-ui-xs text-foreground-subtle"
                                title={
                                  model.reasoning.status === "known"
                                    ? model.reasoning.levels.join(" / ")
                                    : message("reasoning.unknown")
                                }
                              >
                                {message(`reasoning.${model.reasoning.source}`)}
                              </span>
                            ) : null}
                            {added ? (
                              <span className="ml-auto shrink-0 text-ui-sm text-foreground-subtle">
                                {message("added")}
                              </span>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
              {onSelectModels ? (
                <DialogFooter className="mt-1">
                  <Button
                    type="button"
                    data-testid="model-provider-discovery-confirm"
                    disabled={!selected.length}
                    onClick={confirm}
                  >
                    {intl.formatMessage(
                      { id: "settings.modelProvider.discovery.confirm" },
                      { count: selected.length },
                    )}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
