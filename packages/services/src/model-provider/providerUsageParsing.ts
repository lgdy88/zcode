import type { ProviderUsageConfig, ProviderUsageItem } from "@zcode/provider";

export function usageObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function usageNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
function usageTime(value: unknown): number | undefined {
  const n = usageNumber(value);
  if (n !== undefined) return n < 1e12 ? n * 1000 : n;
  if (typeof value === "string") {
    const n = Date.parse(value);
    if (Number.isFinite(n)) return n;
  }
}
function usagePath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const key of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (
      !key ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
function quotaItem(
  label: string,
  used: unknown,
  total: unknown,
  reset?: unknown,
): ProviderUsageItem | undefined {
  const u = usageNumber(used),
    t = usageNumber(total);
  if (u === undefined || t === undefined || t <= 0) return;
  return {
    label,
    used: u,
    total: t,
    remaining: Math.max(0, t - u),
    remainingPercent: Math.max(0, Math.min(100, 100 - (u / t) * 100)),
    resetsAt: usageTime(reset),
  };
}
function percentageItem(
  label: string,
  value: unknown,
  reset?: unknown,
  remaining = false,
): ProviderUsageItem | undefined {
  const n = usageNumber(value);
  if (n === undefined) return;
  return {
    label,
    remainingPercent: Math.max(0, Math.min(100, remaining ? n : 100 - n)),
    resetsAt: usageTime(reset),
  };
}
const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const compact = (value: (ProviderUsageItem | undefined)[]) =>
  value.filter((v): v is ProviderUsageItem => Boolean(v));

/** 百分比方向由各接口合同决定；缺字段不补成零或满额。 */
export function parseProviderUsage(
  config: ProviderUsageConfig,
  value: unknown,
): ProviderUsageItem[] {
  const body = usageObject(value),
    data = usageObject(body.data);
  if (
    body.success === false ||
    body.isValid === false ||
    body.is_active === false ||
    body.is_available === false ||
    (usageObject(body.base_resp).status_code !== undefined &&
      usageObject(body.base_resp).status_code !== 0) ||
    (body.code !== undefined && ![true, 0, 200, "0", "200"].includes(body.code as never))
  )
    throw new Error("business");
  if (config.template === "custom") {
    const c = config.custom;
    if (!c) throw new Error("invalid-config");
    const source = c.rowsPath ? rows(usagePath(body, c.rowsPath)) : [body];
    return source.slice(0, 32).map((row) => {
      const get = (field: keyof typeof c.fields) =>
        c.fields[field] ? usagePath(row, c.fields[field]) : undefined;
      if (get("isValid") === false) throw new Error("business");
      const n = (field: "remaining" | "used" | "total") => {
        const n = usageNumber(get(field));
        return n === undefined ? undefined : n / c.divisor;
      };
      const used = n("used"),
        total = n("total"),
        remaining = n("remaining");
      const percent =
        usageNumber(get("remainingPercent")) ??
        (usageNumber(get("usedPercent")) !== undefined
          ? 100 - usageNumber(get("usedPercent"))!
          : undefined) ??
        (used !== undefined && total !== undefined && total > 0
          ? 100 - (used / total) * 100
          : undefined);
      return {
        label: typeof get("label") === "string" ? String(get("label")).slice(0, 128) : undefined,
        remaining,
        used,
        total,
        remainingPercent: percent === undefined ? undefined : Math.max(0, Math.min(100, percent)),
        unit: typeof get("unit") === "string" ? String(get("unit")).slice(0, 32) : c.unit,
        resetsAt: usageTime(get("resetsAt")),
      };
    });
  }
  if (config.template === "general")
    return [
      {
        remaining: usageNumber(body.balance),
        unit: typeof body.unit === "string" ? body.unit : "USD",
      },
    ];
  if (config.template === "new-api") {
    const remaining = usageNumber(data.quota),
      used = usageNumber(data.used_quota);
    return [
      {
        remaining: remaining === undefined ? undefined : remaining / 500000,
        used: used === undefined ? undefined : used / 500000,
        total:
          remaining !== undefined && used !== undefined ? (remaining + used) / 500000 : undefined,
        unit: "USD",
      },
    ];
  }
  if (config.template === "sub2api") {
    const quota = usageObject(body.quota),
      items: ProviderUsageItem[] = [];
    const remaining = usageNumber(body.remaining);
    if (remaining !== undefined && remaining >= 0)
      items.push({
        remaining,
        unit:
          typeof body.unit === "string"
            ? body.unit
            : typeof quota.unit === "string"
              ? quota.unit
              : "USD",
      });
    const limit = quotaItem(
      typeof body.planName === "string" ? body.planName : "quota",
      quota.used,
      quota.limit,
      quota.reset_at,
    );
    if (limit)
      items.push({ ...limit, unit: typeof quota.unit === "string" ? quota.unit : undefined });
    return items;
  }
  if (config.template === "balance") {
    switch (config.balanceProvider) {
      case "deepseek":
        return rows(body.balance_infos).map((item) => {
          const r = usageObject(item);
          return {
            remaining: usageNumber(r.total_balance),
            unit: typeof r.currency === "string" ? r.currency : "USD",
          };
        });
      case "stepfun":
        return [{ remaining: usageNumber(body.balance), unit: "CNY" }];
      case "siliconflow":
        return [
          {
            remaining: usageNumber(data.totalBalance),
            unit:
              config.baseUrl && new URL(config.baseUrl).hostname === "api.siliconflow.com"
                ? "USD"
                : "CNY",
          },
        ];
      case "openrouter": {
        const total = usageNumber(data.total_credits),
          used = usageNumber(data.total_usage);
        return [
          {
            remaining: total !== undefined && used !== undefined ? total - used : undefined,
            total,
            used,
            unit: "USD",
          },
        ];
      }
      case "novita": {
        const balance = usageNumber(body.availableBalance);
        return [{ remaining: balance === undefined ? undefined : balance / 10000, unit: "USD" }];
      }
    }
    throw new Error("invalid-config");
  }
  switch (config.tokenPlanProvider) {
    case "kimi":
      return compact([
        ...rows(body.limits).map((item) => {
          const r = usageObject(usageObject(item).detail);
          return quotaItem(
            "five_hour",
            usageNumber(r.limit)! - usageNumber(r.remaining)!,
            r.limit,
            r.resetTime,
          );
        }),
        quotaItem(
          "weekly",
          usageNumber(usageObject(body.usage).limit)! -
            usageNumber(usageObject(body.usage).remaining)!,
          usageObject(body.usage).limit,
          usageObject(body.usage).resetTime,
        ),
      ]);
    case "zhipu":
    case "zhipu-team":
      return compact(
        rows(data.limits).flatMap((item) => {
          const r = usageObject(item);
          if (!["TOKENS_LIMIT", "CREDIT_LIMIT"].includes(String(r.type).toUpperCase())) return [];
          return [
            percentageItem(
              r.unit === 3 ? "five_hour" : r.unit === 6 ? "weekly" : String(r.unit ?? "quota"),
              r.percentage,
              r.nextResetTime,
            ),
          ];
        }),
      );
    case "minimax": {
      const r = usageObject(
        rows(body.model_remains).find((item) => usageObject(item).model_name === "general"),
      );
      return compact([
        percentageItem("five_hour", r.current_interval_remaining_percent, r.end_time, true),
        r.current_weekly_status === 1
          ? percentageItem("weekly", r.current_weekly_remaining_percent, r.weekly_end_time, true)
          : undefined,
      ]);
    }
    case "zenmux":
      return compact([
        percentageItem(
          "five_hour",
          usageNumber(usageObject(data.quota_5_hour).usage_percentage)! * 100,
          usageObject(data.quota_5_hour).resets_at,
        ),
        percentageItem(
          "weekly",
          usageNumber(usageObject(data.quota_7_day).usage_percentage)! * 100,
          usageObject(data.quota_7_day).resets_at,
        ),
      ]);
    case "opencode-go":
      return compact(
        (
          [
            ["rolling", "five_hour"],
            ["weekly", "weekly"],
            ["monthly", "monthly"],
          ] as const
        ).map(([key, label]) => {
          const r = usageObject(usageObject(body.usage)[key]);
          return percentageItem(
            label,
            r.percent,
            usageNumber(r.percent)! > 0 ? r.resetsAt : undefined,
          );
        }),
      );
    case "volcengine": {
      if (usageObject(body.ResponseMetadata).Error) throw new Error("business");
      const r = usageObject(body.Result);
      return config.planKind === "agent"
        ? compact(
            (
              [
                ["AFPFiveHour", "five_hour"],
                ["AFPWeekly", "weekly"],
                ["AFPMonthly", "monthly"],
              ] as const
            ).map(([key, label]) => {
              const w = usageObject(r[key]);
              return quotaItem(label, w.Used, w.Quota, w.ResetTime);
            }),
          )
        : compact(
            rows(r.QuotaUsage).map((item) => {
              const w = usageObject(item);
              return percentageItem(String(w.Level ?? "quota"), w.Percent, w.ResetTime);
            }),
          );
    }
    case "command-code": {
      const credit = usageObject(body.credits),
        limits = usageObject(body.windowLimits ?? credit.windowLimits);
      const amount = [credit.monthlyCredits, credit.purchasedCredits, credit.freeCredits].map(
        usageNumber,
      );
      return compact([
        limits.limited === true
          ? quotaItem(
              "five_hour",
              usageObject(limits.fiveHour).used,
              usageObject(limits.fiveHour).cap,
              usageObject(limits.fiveHour).resetAt,
            )
          : undefined,
        limits.limited === true
          ? quotaItem(
              "weekly",
              usageObject(limits.weekly).used,
              usageObject(limits.weekly).cap,
              usageObject(limits.weekly).resetAt,
            )
          : undefined,
        amount.every((n) => n !== undefined)
          ? { remaining: amount.reduce((sum, n) => sum! + n!, 0), unit: "credits" }
          : undefined,
      ]);
    }
  }
  throw new Error("invalid-config");
}

export function validateUsageItems(items: ProviderUsageItem[]): ProviderUsageItem[] {
  if (
    !items.length ||
    items.length > 32 ||
    items.some(
      (row) =>
        (row.label?.length ?? 0) > 128 ||
        (row.unit?.length ?? 0) > 32 ||
        (row.unlimited !== true &&
          ![row.remaining, row.remainingPercent, row.used, row.total].some(
            (value) => typeof value === "number" && Number.isFinite(value),
          )) ||
        [row.remaining, row.remainingPercent, row.used, row.total, row.resetsAt].some(
          (value) => value !== undefined && !Number.isFinite(value),
        ),
    )
  )
    throw new Error("invalid-response");
  return items;
}
