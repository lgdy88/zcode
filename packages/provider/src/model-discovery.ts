import type { ProviderConfigObject } from "./config/index.js";
import type { ModelReasoningMetadata } from "./model-reasoning.js";

export interface DiscoveredProviderModel {
  readonly id: string;
  readonly ownedBy?: string;
  readonly reasoning?: ModelReasoningMetadata;
}

export type ProviderModelDiscoveryErrorCode =
  | "provider-unavailable"
  | "unsupported-provider"
  | "missing-url"
  | "missing-key"
  | "invalid-url"
  | "auth"
  | "not-supported"
  | "http"
  | "timeout"
  | "network"
  | "invalid-response"
  | "too-large"
  | "connection-changed"
  | "capability-save-failed";

export type ProviderModelDiscoveryResult =
  | { readonly success: true; readonly models: readonly DiscoveredProviderModel[] }
  | { readonly success: false; readonly error: { readonly code: ProviderModelDiscoveryErrorCode } };

export type ProviderModelDiscoveryFetcher = (
  config: ProviderConfigObject,
  providerId?: string,
) => Promise<ProviderModelDiscoveryResult>;
