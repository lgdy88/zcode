import { z } from "zod";
export const providerUsageSecretRequestSchema = z
  .object({
    providerId: z.string().min(1),
    field: z.enum(["accessToken", "secretKey"]),
    expectedRevision: z.string().min(1),
  })
  .strict();
export type ProviderUsageSecretRequest = z.infer<typeof providerUsageSecretRequestSchema>;

export const usageTemplates = [
  "custom",
  "general",
  "new-api",
  "sub2api",
  "token-plan",
  "balance",
] as const;
export const tokenPlanProviders = [
  "kimi",
  "zhipu",
  "zhipu-team",
  "minimax",
  "zenmux",
  "volcengine",
  "opencode-go",
  "command-code",
] as const;
export const balanceProviders = [
  "deepseek",
  "stepfun",
  "siliconflow",
  "openrouter",
  "novita",
] as const;
const text = z.string().max(2048);
const path = z
  .string()
  .max(256)
  .refine(
    (value) =>
      !value
        .split(/[.[\]]/)
        .some((part) => ["__proto__", "constructor", "prototype"].includes(part)),
    "Invalid field path",
  );
export const usageFieldMapSchema = z
  .object({
    label: path.optional(),
    remaining: path.optional(),
    used: path.optional(),
    total: path.optional(),
    remainingPercent: path.optional(),
    usedPercent: path.optional(),
    resetsAt: path.optional(),
    unit: path.optional(),
    isValid: path.optional(),
  })
  .strict();
export const providerUsageConfigSchema = z
  .object({
    enabled: z.boolean(),
    template: z.enum(usageTemplates),
    timeoutSeconds: z.number().int().min(1).max(60),
    refreshMinutes: z.number().int().min(0).max(1440),
    baseUrl: text.optional(),
    tokenPlanProvider: z.enum(tokenPlanProviders).optional(),
    balanceProvider: z.enum(balanceProviders).optional(),
    userId: z.string().max(128).optional(),
    organizationId: z.string().max(128).optional(),
    projectId: z.string().max(128).optional(),
    region: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,63}$/)
      .optional(),
    planKind: z.enum(["agent", "coding"]).optional(),
    accessKeyId: z.string().max(128).optional(),
    custom: z
      .object({
        path: text,
        method: z.enum(["GET", "POST"]),
        headers: z.record(z.string().max(128), z.string().max(2048)),
        body: z.string().max(16384).optional(),
        rowsPath: path.optional(),
        fields: usageFieldMapSchema,
        divisor: z.number().positive().finite(),
        unit: z.string().max(32),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ProviderUsageConfig = z.infer<typeof providerUsageConfigSchema>;
export const defaultProviderUsageConfig: ProviderUsageConfig = {
  enabled: false,
  template: "sub2api",
  timeoutSeconds: 10,
  refreshMinutes: 5,
};
export interface ProviderUsageItem {
  readonly unlimited?: boolean;
  readonly label?: string;
  readonly remaining?: number;
  readonly used?: number;
  readonly total?: number;
  readonly unit?: string;
  readonly remainingPercent?: number;
  readonly resetsAt?: number;
}
export type ProviderUsageErrorCode =
  | "disabled"
  | "unavailable"
  | "missing-credentials"
  | "invalid-url"
  | "cross-origin"
  | "invalid-config"
  | "auth"
  | "http"
  | "network"
  | "timeout"
  | "too-large"
  | "invalid-response"
  | "business"
  | "connection-changed";
export type ProviderUsageResult =
  | {
      readonly status: "ok";
      readonly items: readonly ProviderUsageItem[];
      readonly queriedAt: number;
    }
  | {
      readonly status: "error";
      readonly code: ProviderUsageErrorCode;
      readonly httpStatus?: number;
      readonly queriedAt: number;
    };
export interface ProviderUsageView {
  readonly revision: string;
  readonly config: ProviderUsageConfig;
  readonly hasAccessToken: boolean;
  readonly hasSecretKey: boolean;
  readonly result?: ProviderUsageResult;
}
export interface ProviderUsageCredentialsUpdate {
  readonly accessToken?: string | null;
  readonly secretKey?: string | null;
}
export interface ProviderUsageDraft {
  readonly providerId: string;
  readonly config: ProviderUsageConfig;
  readonly credentials?: ProviderUsageCredentialsUpdate;
}
export interface SaveProviderUsageInput extends ProviderUsageDraft {
  readonly expectedRevision: string;
}
