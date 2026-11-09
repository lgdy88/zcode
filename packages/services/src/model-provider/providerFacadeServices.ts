import type { Event } from "@zcode/rpc";
import { ServiceChannels, modelSelectionSchema } from "@zcode/shared";
import {
  type ModelConfigObject,
  type ModelId,
  type DefaultReasoningEffort,
  type ModelSelection,
  type ModelSelectionFacade,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderConfigObject,
  type ProviderId,
  type ProviderSettingsFacade,
  type ProviderSettingsCreationResult,
  type ModelConfigResolution,
  type ProviderSettingsView,
  type ResolveModelConfigInput,
  type SavePersonalModelDraftInput,
} from "@zcode/provider";
import { createServiceDescriptor } from "../descriptors.js";
import { defaultReasoningEffortSchema } from "@zcode/provider";
import type { ModelConnectivityResult } from "@zcode/shared";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { ProviderUsageOperations } from "./providerUsage.js";
import type {
  ProviderModelDiscoveryFetcher,
  ProviderModelDiscoveryResult,
} from "@zcode/provider";

export type {
  ProviderSettingsProviderView,
  ModelSelectionView,
  ModelSelectionViewInput,
  ProviderSettingsView,
} from "@zcode/provider";

export interface IProviderSettingsService extends ProviderUsageOperations {
  readonly onDidChange: Event<ProviderSettingsView>;
  getView(): Promise<ProviderSettingsView>;
  refresh(reason: string): Promise<ProviderSettingsView>;
  createPersonalProvider(
    input?: Parameters<ProviderSettingsFacade["createPersonalProvider"]>[0],
  ): Promise<ProviderSettingsCreationResult>;
  resolveModelConfig(input: ResolveModelConfigInput): Promise<ModelConfigResolution>;
  /** 只读当前供应商目录，不创建或覆盖模型配置。 */
  fetchAvailableModels(providerId: ProviderId): Promise<ProviderModelDiscoveryResult>;
  savePersonalProviderOverlay(
    providerId: ProviderId,
    config: ProviderConfigObject,
    metadata?: Parameters<ProviderSettingsFacade["savePersonalProviderOverlay"]>[2],
  ): Promise<ProviderSettingsView>;
  deletePersonalProvider(providerId: ProviderId): Promise<ProviderSettingsView>;
  reorderPersonalProviders(providerIds: readonly ProviderId[]): Promise<ProviderSettingsView>;
  reorderPersonalModels(
    providerId: ProviderId,
    modelIds: readonly ModelId[],
  ): Promise<ProviderSettingsView>;
  addPersonalModel(
    providerId: ProviderId,
    modelId: ModelId,
    config: ModelConfigObject,
    useRecommendedConfig?: boolean,
  ): Promise<ProviderSettingsView>;
  renamePersonalModel(
    providerId: ProviderId,
    currentModelId: ModelId,
    nextModelId: ModelId,
  ): Promise<ProviderSettingsView>;
  deletePersonalModel(providerId: ProviderId, modelId: ModelId): Promise<ProviderSettingsView>;
  savePersonalModelDraft(input: SavePersonalModelDraftInput): Promise<ProviderSettingsView>;
  setPersonalModelEnabled(
    providerId: ProviderId,
    modelId: ModelId,
    enabled: boolean,
  ): Promise<ProviderSettingsView>;
  /** 测试已经保存并进入目标 Environment Registry 的正式 Model。 */
  testModelConnectivity(
    input: ProviderSettingsConnectivityRequest,
  ): Promise<ModelConnectivityResult>;
}

export const IProviderSettingsService = createServiceDescriptor<IProviderSettingsService>(
  ServiceChannels.ProviderSettings,
);

export interface ProviderSettingsConnectivityTestInput {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
}

export interface ProviderSettingsConnectivityRequest {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
}

export type ProviderSettingsConnectivityTester = (
  input: ProviderSettingsConnectivityTestInput,
) => Promise<ModelConnectivityResult>;

export interface IModelSelectionService {
  readonly onDidChange: Event<ModelSelectionView>;
  getView(input?: ModelSelectionViewInput): Promise<ModelSelectionView>;
  saveDefaultReasoningEffort(input: DefaultReasoningEffort): Promise<ModelSelectionView>;
  saveProviderDefault(selection: ModelSelection): Promise<ModelSelectionView>;
  saveConfiguredDefault(selection: ModelSelection): Promise<ModelSelectionView>;
}

export interface ModelSelectionConfiguredDefaultSource {
  read(): Promise<ModelSelection | undefined>;
  readState?(): Promise<{
    configuredDefault?: ModelSelection;
    providerDefaults: Readonly<Record<string, ModelSelection>>;
  }>;
  saveDefaultReasoningEffort?(effort: DefaultReasoningEffort): Promise<void>;
  saveProviderDefault?(selection: ModelSelection): Promise<void>;
  saveConfiguredDefault?(selection: ModelSelection): Promise<ModelSelection | undefined>;
  onDidChange?(listener: () => void): () => void;
}

export const IModelSelectionService = createServiceDescriptor<IModelSelectionService>(
  ServiceChannels.ModelSelection,
);

export function createProviderSettingsService(
  facade: ProviderSettingsFacade,
  ensureReady: () => Promise<void> = async () => {},
  testConnectivity?: ProviderSettingsConnectivityTester,
  usage?: ProviderUsageOperations & {
    removeProviderUsage?: (providerId: string) => Promise<void>;
  },
  fetchModels?: ProviderModelDiscoveryFetcher,
): IProviderSettingsService {
  const requireUsage = () => {
    if (!usage) throw new Error("当前环境未装配供应商用量查询");
    return usage;
  };
  return {
    onDidChangeUsage: usage?.onDidChangeUsage ?? (() => ({ dispose() {} })),
    getProviderUsage: (id) => requireUsage().getProviderUsage(id),
    readProviderUsageSecret: (input) => requireUsage().readProviderUsageSecret(input),
    saveProviderUsage: (input) => requireUsage().saveProviderUsage(input),
    queryProviderUsage: (id, automatic) => requireUsage().queryProviderUsage(id, automatic),
    testProviderUsage: (input) => requireUsage().testProviderUsage(input),
    onDidChange: toEvent((listener) => facade.onDidChange(listener)),
    getView: async () => {
      await ensureReady();
      return facade.getView();
    },
    refresh: async (reason) => {
      await ensureReady();
      return facade.refresh(reason);
    },
    createPersonalProvider: async (input) => {
      await ensureReady();
      return facade.createPersonalProvider(input);
    },
    resolveModelConfig: async (input) => {
      await ensureReady();
      return facade.resolveModelConfig(input);
    },
    fetchAvailableModels: async (providerId) => {
      await ensureReady();
      await facade.waitForProviderOperations(providerId);
      const provider = facade.getView().providers.find((item) => item.providerId === providerId);
      if (!provider) return { success: false, error: { code: "provider-unavailable" } };
      if (provider.effectiveConfig.access?.type === "zhipu-account") {
        // 账号模型目录由内置配置与套餐白名单拥有，沿原刷新链路读取，不能拿账号凭据探测 /models。
        const view = await facade.refresh("model-discovery");
        const current = view.providers.find((item) => item.providerId === providerId);
        if (!current) return { success: false, error: { code: "provider-unavailable" } };
        if (
          current.accountState?.connectionKey !== provider.accountState?.connectionKey ||
          current.effectiveConfig.access?.type !== "zhipu-account"
        )
          return { success: false, error: { code: "connection-changed" } };
        if (current.accountState?.availability === "unknown")
          return { success: false, error: { code: "network" } };
        if (
          current.accountState?.availability !== "available" &&
          current.accountState?.availability !== "pending"
        )
          return { success: false, error: { code: "provider-unavailable" } };
        return {
          success: true,
          models: [...new Set(current.effectiveConfig.builtinModelIds ?? [])]
            .sort((a, b) => a.localeCompare(b))
            .map((id) => ({ id })),
        };
      }
      if (!fetchModels) return { success: false, error: { code: "unsupported-provider" } };
      return fetchModels(provider.effectiveConfig, providerId);
    },
    savePersonalProviderOverlay: async (providerId, config, metadata) => {
      await ensureReady();
      return facade.savePersonalProviderOverlay(providerId, config, metadata);
    },
    deletePersonalProvider: async (providerId) => {
      await ensureReady();
      const view = await facade.deletePersonalProvider(providerId);
      // Provider ID 可能再次分配，删除成功后清理独立查询凭据，避免新供应商继承旧账户查询。
      await usage?.removeProviderUsage?.(providerId);
      return view;
    },
    reorderPersonalProviders: async (providerIds) => {
      await ensureReady();
      return facade.reorderPersonalProviders(providerIds);
    },
    reorderPersonalModels: async (providerId, modelIds) => {
      await ensureReady();
      return facade.reorderPersonalModels(providerId, modelIds);
    },
    addPersonalModel: async (providerId, modelId, config, useRecommendedConfig) => {
      await ensureReady();
      return facade.addPersonalModel(providerId, modelId, config, useRecommendedConfig);
    },
    renamePersonalModel: async (providerId, currentModelId, nextModelId) => {
      await ensureReady();
      return facade.renamePersonalModel(providerId, currentModelId, nextModelId);
    },
    deletePersonalModel: async (providerId, modelId) => {
      await ensureReady();
      return facade.deletePersonalModel(providerId, modelId);
    },
    savePersonalModelDraft: async (input) => {
      await ensureReady();
      return facade.savePersonalModelDraft(input);
    },
    setPersonalModelEnabled: async (providerId, modelId, enabled) => {
      await ensureReady();
      return facade.setPersonalModelEnabled(providerId, modelId, enabled);
    },
    testModelConnectivity: async (input) => {
      await ensureReady();
      if (!testConnectivity) {
        throw new Error("当前 Environment 未装配模型连通性测试能力");
      }
      await facade.waitForProviderOperations(input.providerId);
      // 禁用对象仍存在于配置视图，但不进入执行 Registry；不能把未发布误报成配置丢失。
      // 只消费操作完成后的公共资格，不另查 Key、权益，也不替代目标 Environment 最终校验。
      const provider = facade
        .getView()
        .providers.find((item) => item.providerId === input.providerId);
      const model = provider?.models.find((item) => item.modelId === input.modelId);
      const unavailable =
        !provider || !provider.enabled
          ? "provider-unavailable"
          : !model || !model.enabled || model.issues.length > 0
            ? "model-unavailable"
            : !provider.executable
              ? "provider-unavailable"
              : !model.executable
                ? "model-unavailable"
                : undefined;
      if (unavailable) {
        return {
          success: false,
          error: {
            code: unavailable,
            message:
              unavailable === "provider-unavailable"
                ? "This provider is currently unavailable for connectivity testing."
                : "This model is currently unavailable for connectivity testing.",
          },
        };
      }
      return testConnectivity({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        providerId: input.providerId,
        modelId: input.modelId,
      });
    },
  };
}

export function createModelSelectionService(
  facade: ModelSelectionFacade,
  ensureReady: () => Promise<void> = async () => {},
  configuredDefaultSource?: ModelSelectionConfiguredDefaultSource,
  refreshSelectionDefaults?: () => Promise<unknown>,
): IModelSelectionService & { dispose(): void } {
  const log = createServiceLogger("model-selection");
  let revision = 0;
  let disposed = false;
  const listeners = new Set<(view: ModelSelectionView) => void>();
  const getView = async (input?: ModelSelectionViewInput): Promise<ModelSelectionView> => {
    await ensureReady();
    if (disposed) throw new Error("ModelSelectionService 已 dispose");
    // 默认设置会在异步读取期间变更；旧读取必须保留其起始 revision，不能冒充新回执。
    const base = facade.getView();
    if (revision < base.revision) revision = base.revision;
    const readRevision = revision;
    const state = configuredDefaultSource?.readState
      ? await configuredDefaultSource.readState()
      : { configuredDefault: await configuredDefaultSource?.read(), providerDefaults: {} };
    if (disposed) throw new Error("ModelSelectionService 已 dispose");
    return {
      ...facade.getView(state.configuredDefault, readRevision, input),
      providerDefaults: state.providerDefaults,
    };
  };
  const emit = (): void => {
    if (disposed) return;
    revision += 1;
    void getView().then(
      (view) => {
        if (disposed) return;
        for (const listener of listeners) listener(view);
      },
      (error: unknown) => {
        // Registry 事件触发的异步 View 重建没有 owner；Host dispose 后它仍会继续
        // 读取已释放的配置仓库，并形成未处理 rejection。dispose 是明确的取消边界；仅在服务
        // 仍存活时记录真实读取失败。
        if (disposed) return;
        log.warn(undefined, `ModelSelection View 刷新失败: ${String(error)}`);
      },
    );
  };
  const disposeFacade = facade.onDidChange(emit);
  const disposeConfiguredDefault = configuredDefaultSource?.onDidChange?.(emit);

  const validateDefault = async (input: ModelSelection): Promise<ModelSelection> => {
    const selection = modelSelectionSchema.parse(input);
    const current = await getView({ selection });
    // 只接受当前公开可选择的模型，不能将隐藏或失效条目设为新默认。
    const model = current.providers
      .find((provider) => provider.providerId === selection.providerId)
      ?.models.find((item) => item.modelId === selection.modelId);
    if (
      !model ||
      current.selectionIssue ||
      current.effectiveSelection?.providerId !== selection.providerId ||
      current.effectiveSelection?.modelId !== selection.modelId
    )
      throw new Error("默认供应商或模型当前不可用");
    return selection;
  };

  return {
    onDidChange: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    getView,
    saveDefaultReasoningEffort: async (input) => {
      const effort = defaultReasoningEffortSchema.parse(input);
      await ensureReady();
      if (!configuredDefaultSource?.saveDefaultReasoningEffort)
        throw new Error("当前 Environment 未装配通用思考强度设置能力");
      await configuredDefaultSource.saveDefaultReasoningEffort(effort);
      // 等 Registry 发布保存后的版本，不能用旧默认值冒充保存成功回执。
      await refreshSelectionDefaults?.();
      return getView();
    },
    saveProviderDefault: async (input) => {
      const selection = await validateDefault(input);
      if (!configuredDefaultSource?.saveProviderDefault)
        throw new Error("当前 Environment 未装配独立默认模型设置能力");
      await configuredDefaultSource.saveProviderDefault(selection);
      return getView();
    },
    saveConfiguredDefault: async (input) => {
      const selection = await validateDefault(input);
      if (!configuredDefaultSource?.saveConfiguredDefault) {
        throw new Error("当前 Environment 未装配默认模型设置能力");
      }
      await configuredDefaultSource.saveConfiguredDefault(selection);
      return getView();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeFacade();
      disposeConfiguredDefault?.();
      listeners.clear();
    },
  };
}

function toEvent<T>(subscribe: (listener: (event: T) => void) => () => void): Event<T> {
  return (listener) => {
    const dispose = subscribe(listener);
    return { dispose };
  };
}
