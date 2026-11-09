import type { Event } from "@zcode/rpc";
import type {
  ProviderUsageView,
  ProviderUsageDraft,
  SaveProviderUsageInput,
  ProviderUsageResult,
  ProviderUsageSecretRequest,
} from "@zcode/provider";
export interface ProviderUsageOperations {
  readonly onDidChangeUsage: Event<{
    readonly providerId: string;
    readonly view?: ProviderUsageView;
  }>;
  getProviderUsage(providerId: string): Promise<ProviderUsageView>;
  readProviderUsageSecret(input: ProviderUsageSecretRequest): Promise<string | undefined>;
  saveProviderUsage(input: SaveProviderUsageInput): Promise<ProviderUsageView>;
  queryProviderUsage(providerId: string, automatic?: boolean): Promise<ProviderUsageView>;
  testProviderUsage(input: ProviderUsageDraft): Promise<ProviderUsageResult>;
}
