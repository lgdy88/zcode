import { useEffect, useRef, useState } from "react";
import {
  providerUsageConfigSchema,
  usageTemplates,
  tokenPlanProviders,
  balanceProviders,
  type ProviderUsageConfig,
  type ProviderUsageCredentialsUpdate,
  type ProviderUsageView,
  type ProviderUsageResult,
  type ProviderUsageDraft,
  type SaveProviderUsageInput,
  type ProviderUsageSecretRequest,
} from "@zcode/provider";
import { Button } from "@/components/ui/button.js";
import { Switch } from "@/components/ui/switch.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ProviderUsageConfigFields } from "./ProviderUsageConfigFields.js";
import { ProviderUsageSummary } from "./ProviderUsageSummary.js";
import { OptionSelect } from "@/components/ui/option-select.js";
import { Textarea } from "@/components/ui/textarea.js";

const planLabels: Record<(typeof tokenPlanProviders)[number], string> = {
  kimi: "Kimi For Coding",
  zhipu: "Zhipu GLM",
  "zhipu-team": "Zhipu GLM Team",
  minimax: "MiniMax",
  zenmux: "ZenMux",
  volcengine: "火山方舟 / Volcengine",
  "opencode-go": "OpenCode Go",
  "command-code": "Command Code",
};
const balanceLabels: Record<(typeof balanceProviders)[number], string> = {
  deepseek: "DeepSeek",
  stepfun: "StepFun",
  siliconflow: "SiliconFlow",
  openrouter: "OpenRouter",
  novita: "Novita AI",
};
const customDefault = {
  path: "/user/balance",
  method: "GET",
  headers: { Authorization: "Bearer {{apiKey}}" },
  fields: { remaining: "balance" },
  divisor: 1,
  unit: "USD",
};
export function ProviderUsageDialog({
  providerId,
  view,
  onClose,
  onSave,
  onTest,
  onReadSecret,
}: {
  providerId: string;
  view: ProviderUsageView;
  onClose: () => void;
  onSave: (input: SaveProviderUsageInput) => Promise<ProviderUsageView>;
  onTest: (input: ProviderUsageDraft) => Promise<ProviderUsageResult>;
  onReadSecret: (input: ProviderUsageSecretRequest) => Promise<string | undefined>;
}) {
  const { intl } = useZCodeIntl();
  const m = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `settings.providerUsage.${key}` }, values);
  const [draft, setDraft] = useState<ProviderUsageConfig>(view.config),
    [credentials, setCredentials] = useState<ProviderUsageCredentialsUpdate>({}),
    [custom, setCustom] = useState(JSON.stringify(view.config.custom ?? customDefault, null, 2)),
    [busy, setBusy] = useState<"test" | "save" | null>(null),
    [error, setError] = useState(""),
    [result, setResult] = useState<ProviderUsageResult>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async (action: "test" | "save") => {
    if (busy) return;
    let config: ProviderUsageConfig;
    try {
      config = providerUsageConfigSchema.parse({
        ...draft,
        ...(draft.template === "custom" ? { custom: JSON.parse(custom) } : {}),
      });
    } catch {
      setError(m("invalidConfig"));
      return;
    }
    setBusy(action);
    setError("");
    setResult(undefined);
    try {
      if (action === "test") {
        const next = await onTest({ providerId, config, credentials });
        if (alive.current) setResult(next);
      } else {
        await onSave({ providerId, config, credentials, expectedRevision: view.revision });
        if (alive.current) onClose();
      }
    } catch (error) {
      if (alive.current)
        setError(m("localError", { message: error instanceof Error ? error.message : "Error" }));
    } finally {
      if (alive.current) setBusy(null);
    }
  };
  const choose = (template: ProviderUsageConfig["template"]) => {
    setDraft({
      ...draft,
      template,
      ...(template === "token-plan" && !draft.tokenPlanProvider
        ? { tokenPlanProvider: "minimax" as const }
        : {}),
      ...(template === "balance" && !draft.balanceProvider
        ? { balanceProvider: "deepseek" as const }
        : {}),
    });
    setResult(undefined);
    setError("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-2xl"
        data-testid="provider-usage-dialog"
      >
        <DialogHeader>
          <DialogTitle>{m("title")}</DialogTitle>
          <DialogDescription>{m("description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <label className="flex items-center justify-between gap-4 rounded-lg bg-surface px-3 py-2.5 text-ui-base">
            <span>{m("enabled")}</span>
            <Switch
              aria-label={m("enabled")}
              checked={draft.enabled}
              disabled={Boolean(busy)}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </label>
          {draft.enabled ? (
            <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-4">
              <label className="flex flex-col gap-1.5 text-ui-sm">
                <span>{m("templates")}</span>
                <OptionSelect
                  aria-label={m("templates")}
                  className="w-full"
                  disabled={Boolean(busy)}
                  value={draft.template}
                  onValueChange={(value) => choose(value as ProviderUsageConfig["template"])}
                  options={usageTemplates.map((template) => ({
                    value: template,
                    label: m(`template.${template}`),
                  }))}
                />
              </label>
              {draft.template === "token-plan" ? (
                <label className="flex flex-col gap-1.5 text-ui-sm">
                  <span>{m("platform")}</span>
                  <OptionSelect
                    aria-label={m("platform")}
                    className="w-full"
                    disabled={Boolean(busy)}
                    value={draft.tokenPlanProvider ?? "minimax"}
                    options={tokenPlanProviders.map((id) => ({ value: id, label: planLabels[id] }))}
                    onValueChange={(value) => {
                      setDraft({
                        ...draft,
                        tokenPlanProvider: value as ProviderUsageConfig["tokenPlanProvider"],
                      });
                      setResult(undefined);
                    }}
                  />
                </label>
              ) : null}
              {draft.template === "balance" ? (
                <label className="flex flex-col gap-1.5 text-ui-sm">
                  <span>{m("platform")}</span>
                  <OptionSelect
                    aria-label={m("platform")}
                    className="w-full"
                    disabled={Boolean(busy)}
                    value={draft.balanceProvider ?? "deepseek"}
                    options={balanceProviders.map((id) => ({
                      value: id,
                      label: balanceLabels[id],
                    }))}
                    onValueChange={(value) => {
                      setDraft({
                        ...draft,
                        balanceProvider: value as ProviderUsageConfig["balanceProvider"],
                      });
                      setResult(undefined);
                    }}
                  />
                </label>
              ) : null}
              <ProviderUsageConfigFields
                draft={draft}
                onChange={(next) => {
                  setDraft(next);
                  setResult(undefined);
                }}
                credentials={credentials}
                onCredentials={setCredentials}
                view={view}
                secretScope={`${providerId}:${view.revision}`}
                onReveal={(field) =>
                  onReadSecret({ providerId, field, expectedRevision: view.revision })
                }
              />
              {draft.template === "custom" ? (
                <label className="flex flex-col gap-1.5 text-ui-sm">
                  <span>{m("custom")}</span>
                  <Textarea
                    aria-label={m("custom")}
                    className="min-h-64 w-full rounded-md border bg-background p-3 font-mono text-ui-sm"
                    value={custom}
                    onChange={(event) => {
                      setCustom(event.target.value);
                      setResult(undefined);
                    }}
                    spellCheck={false}
                  />
                  <p className="text-foreground-subtle">{m("customHint")}</p>
                </label>
              ) : null}
            </fieldset>
          ) : null}
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          {result ? <ProviderUsageSummary result={result} /> : null}
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!draft.enabled || Boolean(busy)}
            onClick={() => void run("test")}
          >
            {m(busy === "test" ? "testing" : "test")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {m("cancel")}
          </Button>
          <Button type="button" disabled={Boolean(busy)} onClick={() => void run("save")}>
            {m(busy === "save" ? "saving" : "save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
