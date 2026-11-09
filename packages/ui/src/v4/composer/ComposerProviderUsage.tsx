import type { UsageEntitlementSnapshot } from "@zcode/shared";
import type { ProviderUsageResult } from "@zcode/provider";
import {
  findCodingPlanQuotaLimit,
  getQuotaRemainingPercentage,
} from "@/lib/codingPlanQuotaPresentation.js";

/** 圆环只投影已有额度；缺失比例仍保留底轨，金额不能冒充剩余百分比。 */
export function ProviderUsageRings({
  result,
  showWeekly,
}: {
  result?: ProviderUsageResult;
  showWeekly: boolean;
}) {
  const items = result?.status === "ok" ? result.items : [];
  const fiveHour = items.find((item) => item.label === "five_hour");
  const weekly = items.find((item) => item.label === "weekly");
  const balanceOnly = !fiveHour && !weekly && items.some((item) => item.remaining !== undefined);
  const rings = [
    {
      key: "five_hour",
      radius: 16,
      item: fiveHour,
      // 用户定版：进度环统一 #31CF76；底轨是"已用部分"，用比背景深的灰与绿色剩余形成对比。
      color: "stroke-[#31CF76]",
      track: "stroke-foreground/25",
    },
    ...(!balanceOnly && (showWeekly || weekly)
      ? [
          {
            key: "weekly",
            radius: 12,
            item: weekly,
            color: "stroke-[#31CF76]",
            track: "stroke-foreground/25",
          },
        ]
      : []),
  ];
  return (
    <span className="relative flex size-8 items-center justify-center">
      <svg
        viewBox="0 0 36 36"
        className="absolute inset-0 size-8 -rotate-90"
        fill="none"
        strokeWidth="2"
        aria-hidden="true"
      >
        {rings.map(({ key, radius, item, color, track }) => {
          const value = item?.remainingPercent;
          const percentage =
            value !== undefined && Number.isFinite(value)
              ? Math.max(0, Math.min(100, value))
              : undefined;
          return (
            <g key={key} data-provider-ring={balanceOnly ? "balance" : key} data-remaining={percentage}>
              <circle cx="18" cy="18" r={radius} className={percentage === undefined ? color : track} />
              {percentage !== undefined && percentage > 0 && (
                <circle
                  cx="18"
                  cy="18"
                  r={radius}
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={100 - percentage}
                  strokeLinecap="round"
                  className={color}
                />
              )}
            </g>
          );
        })}
      </svg>
      <span className="size-2.5 rotate-45 rounded-xs bg-foreground/25" aria-hidden="true" />
    </span>
  );
}

/** 账号套餐直接展示工具栏已有权益，不走自定义 Key 的用量配置。 */
export function accountProviderUsageResult(
  snapshot: UsageEntitlementSnapshot | null | undefined,
): ProviderUsageResult | undefined {
  if (!snapshot) {
    return undefined;
  }
  const items = [
    {
      label: "five_hour",
      limit: findCodingPlanQuotaLimit(snapshot.quota?.limits, "TOKENS_LIMIT", 3, 5),
    },
    { label: "weekly", limit: findCodingPlanQuotaLimit(snapshot.quota?.limits, "TOKENS_LIMIT", 6) },
  ].flatMap(({ label, limit }) => {
    const remainingPercent = getQuotaRemainingPercentage(limit);
    return remainingPercent === null
      ? []
      : [{ label, remainingPercent, resetsAt: limit?.nextResetTime }];
  });
  return items.length ? { status: "ok", items, queriedAt: snapshot.generatedAt } : undefined;
}
