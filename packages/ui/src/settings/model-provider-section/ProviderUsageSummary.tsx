import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import type { ProviderUsageResult } from "@zcode/provider";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
export function ProviderUsageSummary({
  result,
  loading,
  onRefresh,
  inline = false,
  stacked = false,
}: {
  result?: ProviderUsageResult;
  loading?: boolean;
  onRefresh?: () => void;
  inline?: boolean;
  stacked?: boolean;
}) {
  const { intl, locale } = useZCodeIntl();
  const [now, setNow] = useState(Date.now());
  const hasReset =
    result?.status === "ok" && result.items.some((row) => row.resetsAt !== undefined);
  useEffect(() => {
    // 查询完成时间晚于组件挂载时间，刷新后立即对时，避免暂时多显示一分钟。
    setNow(Date.now());
    if (!hasReset) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [hasReset, result?.queriedAt]);
  const m = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `settings.providerUsage.${key}` }, values);
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
  const title = result
    ? m("queriedAt", { time: new Date(result.queriedAt).toLocaleString(locale) })
    : m("refresh");
  const content = (
    <>
      {loading ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : null}
      {!result ? (
        m("never")
      ) : result.status === "error" ? (
        <span className="text-destructive">
          {m(`error.${result.code}`)}
          {result.httpStatus ? ` (${result.httpStatus})` : ""}
        </span>
      ) : (
        result.items.map((item, index) => {
          const known = [
            "five_hour",
            "weekly",
            "monthly",
            "session",
            "quota",
            "token_quota",
          ].includes(item.label ?? "");
          const label = known ? m(item.label!) : (item.label ?? "");
          const minutes =
            item.resetsAt === undefined
              ? undefined
              : Math.max(0, Math.ceil((item.resetsAt - now) / 60000));
          return (
            <span
              key={index}
              className={`inline-flex ${inline ? "flex-nowrap whitespace-nowrap" : "flex-wrap"} items-center gap-1.5`}
            >
              <span
                className={
                  item.remainingPercent !== undefined && item.remainingPercent < 10
                    ? "font-medium text-destructive"
                    : "text-emerald-600 dark:text-emerald-400"
                }
              >
                {item.unlimited
                  ? m("unlimited", { label })
                  : item.remainingPercent !== undefined
                    ? m("remaining", { label, value: number(item.remainingPercent) })
                    : `${label || m(item.remaining !== undefined ? "balance" : item.used !== undefined ? "used" : "total")} ${number(item.remaining ?? item.used ?? item.total!)} ${item.unit ?? ""}`}
              </span>
              {minutes !== undefined ? (
                <span className="inline-flex items-center gap-1 text-foreground-subtle">
                  <Clock3 className="size-3.5" />
                  {minutes === 0
                    ? m("resetNow")
                    : m("resetIn", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
                </span>
              ) : null}
            </span>
          );
        })
      )}
    </>
  );
  const Container = inline ? "span" : "div";
  return onRefresh ? (
    <button
      type="button"
      title={`${m("refresh")} · ${title}`}
      aria-label={m("refresh")}
      disabled={loading}
      onClick={onRefresh}
      className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-left text-ui-sm disabled:opacity-60"
      data-testid="provider-usage-summary"
    >
      {content}
    </button>
  ) : (
    <Container
      title={title}
      className={`${stacked ? "flex flex-col items-start" : inline ? "inline-flex flex-nowrap whitespace-nowrap items-center" : "flex flex-wrap items-center"} gap-x-4 gap-y-1 text-ui-sm`}
      role="status"
      data-testid="provider-usage-test-result"
    >
      {content}
    </Container>
  );
}
