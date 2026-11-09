import type {
  ProviderUsageConfig,
  ProviderUsageCredentialsUpdate,
  ProviderUsageView,
} from "@zcode/provider";
import { Input } from "@/components/ui/input.js";
import { SecretInput } from "@/components/ui/secret-input.js";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function ProviderUsageConfigFields({
  draft,
  onChange,
  credentials,
  onCredentials,
  view,
  onReveal,
  secretScope,
}: {
  draft: ProviderUsageConfig;
  onChange: (value: ProviderUsageConfig) => void;
  credentials: ProviderUsageCredentialsUpdate;
  onCredentials: (value: ProviderUsageCredentialsUpdate) => void;
  view: ProviderUsageView;
  secretScope?: string;
  onReveal?: (field: "accessToken" | "secretKey") => Promise<string | undefined>;
}) {
  const { intl } = useZCodeIntl();
  const m = (key: string) => intl.formatMessage({ id: `settings.providerUsage.${key}` });
  const field = (
    key: "baseUrl" | "userId" | "organizationId" | "projectId" | "accessKeyId" | "region",
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1.5 text-ui-sm" key={key}>
      <span>{m(key)}</span>
      <Input
        aria-label={m(key)}
        value={draft[key] ?? ""}
        placeholder={key === "baseUrl" ? "https://api.example.com" : undefined}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
      />
      {hint ? <p className="text-foreground-subtle">{hint}</p> : null}
    </label>
  );
  const secret = (key: "accessToken" | "secretKey", label: string, hasValue: boolean) => (
    <label className="flex flex-col gap-1.5 text-ui-sm">
      <span>{m(label)}</span>
      <div className="flex gap-2">
        <SecretInput
          secretId={`${secretScope ?? view.revision}:${key}:${credentials[key] === null ? "cleared" : "active"}`}
          loadStoredValue={
            hasValue && credentials[key] !== null && onReveal ? () => onReveal(key) : undefined
          }
          autoComplete="new-password"
          aria-label={m(label)}
          placeholder={
            credentials[key] === null
              ? m("secretWillClear")
              : hasValue
                ? m("secretSaved")
                : undefined
          }
          value={credentials[key] ?? ""}
          onChange={(event) =>
            onCredentials({ ...credentials, [key]: event.target.value || undefined })
          }
        />
        {hasValue || credentials[key] ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label={m(key === "accessToken" ? "clearToken" : "clearSecret")}
            onClick={() => onCredentials({ ...credentials, [key]: null })}
          >
            {m("clear")}
          </Button>
        ) : null}
      </div>
    </label>
  );
  const volc = draft.template === "token-plan" && draft.tokenPlanProvider === "volcengine";
  return (
    <div className="flex flex-col gap-4">
      {field("baseUrl", m("baseHint"))}
      {volc ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {field("accessKeyId")}
          {secret("secretKey", "secretKey", view.hasSecretKey)}
          {field("region")}
          <label className="flex flex-col gap-1.5 text-ui-sm">
            <span>{m("planKind")}</span>
            {/* 原生 select 绕过主题弹层，复用现有控件并保持只修改草稿。 */}
            <Select
              value={draft.planKind ?? "coding"}
              onValueChange={(value) =>
                onChange({ ...draft, planKind: value as "agent" | "coding" })
              }
            >
              <SelectTrigger className="w-full" aria-label={m("planKind")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coding">{m("coding")}</SelectItem>
                <SelectItem value="agent">{m("agent")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      ) : (
        <div className="space-y-1.5">
          {secret("accessToken", "token", view.hasAccessToken)}
          <p className="text-ui-sm text-foreground-subtle">
            {m(draft.template === "new-api" ? "tokenHintNewApi" : "tokenHint")}
          </p>
        </div>
      )}
      {draft.template === "new-api" ? field("userId") : null}
      {draft.template === "token-plan" &&
      ["zhipu-team", "command-code"].includes(draft.tokenPlanProvider ?? "") ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {field("organizationId")}
          {draft.tokenPlanProvider === "zhipu-team" ? field("projectId") : null}
        </div>
      ) : null}
      {draft.template === "token-plan" &&
      ["minimax", "volcengine"].includes(draft.tokenPlanProvider ?? "") ? (
        <p className="text-ui-sm text-foreground-subtle">
          {m(draft.tokenPlanProvider === "volcengine" ? "volcengineHint" : "minimaxHint")}
        </p>
      ) : null}
      <details className="space-y-3 border-t border-border pt-3">
        <summary className="cursor-pointer text-ui-sm text-foreground-subtle">
          {m("advanced")}
        </summary>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-ui-sm">
            <span>{m("timeout")}</span>
            <Input
              type="number"
              aria-label={m("timeout")}
              min={1}
              max={60}
              value={draft.timeoutSeconds}
              onChange={(e) => onChange({ ...draft, timeoutSeconds: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-ui-sm">
            <span>{m("interval")}</span>
            <Input
              type="number"
              aria-label={m("interval")}
              min={0}
              max={1440}
              value={draft.refreshMinutes}
              onChange={(e) => onChange({ ...draft, refreshMinutes: Number(e.target.value) })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
