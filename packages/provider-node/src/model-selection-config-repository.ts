import type {
  ModelSelection,
  PersonalProviderConfigRepository,
  DefaultReasoningEffort,
} from "@zcode/provider";

export interface NodeModelSelectionConfigRepositoryOptions {
  readonly personalRepository: PersonalProviderConfigRepository;
}

/** 默认供应商与各家模型偏好统一经 Personal 入口；IO、锁和失效通知归同一个 Repository。 */
export class NodeModelSelectionConfigRepository {
  readonly #personal: PersonalProviderConfigRepository;
  readonly #subscriptions = new Set<() => void>();
  #disposed = false;

  constructor(options: NodeModelSelectionConfigRepositoryOptions) {
    this.#personal = options.personalRepository;
  }

  async read(): Promise<ModelSelection | undefined> {
    return (await this.readState()).configuredDefault;
  }

  async readState(): Promise<{
    configuredDefault?: ModelSelection;
    providerDefaults: Readonly<Record<string, ModelSelection>>;
  }> {
    this.#assertNotDisposed();
    const configuredDefault = (await this.#personal.read()).defaultModelSelection;
    const providerDefaults = (await this.#personal.readProviderModelDefaults?.()) ?? {};
    return {
      configuredDefault: configuredDefault
        ? (providerDefaults[configuredDefault.providerId] ?? configuredDefault)
        : undefined,
      providerDefaults,
    };
  }

  async saveProviderDefault(selection: ModelSelection): Promise<void> {
    this.#assertNotDisposed();
    if (!this.#personal.saveProviderModelDefault)
      throw new Error("当前 Repository 未装配独立默认模型设置能力");
    await this.#personal.saveProviderModelDefault(selection);
  }

  async saveDefaultReasoningEffort(effort: DefaultReasoningEffort): Promise<void> {
    this.#assertNotDisposed();
    if (!this.#personal.saveDefaultReasoningEffort)
      throw new Error("当前 Repository 未装配通用思考强度设置能力");
    await this.#personal.saveDefaultReasoningEffort(effort);
  }

  async saveConfiguredDefault(
    selection: ModelSelection | undefined,
  ): Promise<ModelSelection | undefined> {
    this.#assertNotDisposed();
    if (selection) {
      const saved = (await this.#personal.readProviderModelDefaults?.())?.[selection.providerId];
      // CLI 的既有入口显式保存完整选择；不能让该供应商的旧模型偏好覆盖这次主动选择。
      // 设置页切换供应商已携带其偏好，同值不产生第二次写入。
      if (
        saved &&
        (saved.modelId !== selection.modelId ||
          saved.options?.reasoningLevel !== selection.options?.reasoningLevel)
      ) {
        await this.saveProviderDefault(selection);
      }
    }
    const snapshot = await this.#personal.update((current) => ({
      ...current,
      defaultModelSelection: selection,
    }));
    return snapshot.defaultModelSelection;
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#assertNotDisposed();
    const unsubscribe = this.#personal.onDidChange(listener);
    const dispose = () => {
      this.#subscriptions.delete(dispose);
      unsubscribe();
    };
    this.#subscriptions.add(dispose);
    return dispose;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const dispose of this.#subscriptions) dispose();
    // 不销毁共享 Personal Repository；它仍由 Config Runtime 生命周期管理。
  }

  #assertNotDisposed(): void {
    if (this.#disposed) throw new Error("NodeModelSelectionConfigRepository 已 dispose");
  }
}
