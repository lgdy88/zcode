import { createHash } from "node:crypto";
import {
  defaultProviderUsageConfig,
  providerUsageConfigSchema,
  providerUsageSecretRequestSchema,
  type ProviderUsageSecretRequest,
  isApiKeyAccess,
  type ProviderConfigObject,
  type ProviderUsageView,
  type ProviderUsageResult,
  type ProviderUsageDraft,
  type SaveProviderUsageInput,
} from "@zcode/provider";
import { ProviderUsageStore, withUsageCredentials } from "./providerUsageStore.js";
import { executeProviderUsageQuery } from "./providerUsageQuery.js";
import type { ProviderUsageOperations } from "./providerUsage.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";

/**
 * 连接绑定指纹：provider 的接入参数（类型/BaseURL/headers/Key）哈希。
 * 连接变化即判定缓存用量失效（移植自 fork provider-node 的同名函数，上游无此导出）。
 */
function providerConnectionBinding(config: ProviderConfigObject): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: config.api?.type,
        baseUrl: config.api?.baseUrl?.trim().replace(/\/+$/, ""),
        headers: Object.entries(config.api?.headers ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        key: isApiKeyAccess(config.access) ? config.access.apiKey : null,
      }),
    )
    .digest("hex");
}

const usageLog = createServiceLogger("ProviderUsage");
interface AutomaticQuerySchedule {
  timer?: ReturnType<typeof setTimeout>;
}

export interface ProviderUsageServiceOptions {
  readonly configFilePath: string;
  readonly fetchImpl: typeof fetch;
  readonly resolveProvider: (
    id: string,
  ) => Promise<{ config: ProviderConfigObject; enabled: boolean } | undefined>;
  readonly now?: () => number;
}
interface CachedUsage {
  revision: string;
  binding: string;
  result: ProviderUsageResult;
}
export class ProviderUsageService implements ProviderUsageOperations {
  readonly #store: ProviderUsageStore;
  readonly #listeners = new Set<
    (event: { providerId: string; view?: ProviderUsageView }) => void
  >();
  readonly #observed = new Set<string>();
  readonly #cache = new Map<string, CachedUsage>();
  readonly #pending = new Map<string, { key: string; promise: Promise<ProviderUsageView> }>();
  readonly #lifetime = new AbortController();
  readonly #disposeStore: () => void;
  readonly #automatic = new Map<string, AutomaticQuerySchedule>();
  #automaticStarted = false;
  #scheduleGeneration = 0;
  #disposed = false;
  constructor(readonly options: ProviderUsageServiceOptions) {
    this.#store = new ProviderUsageStore(options.configFilePath);
    this.#disposeStore = this.#store.onDidChange(() => {
      for (const providerId of this.#observed) this.#emit(providerId);
      this.refreshAutomaticQueries();
    });
  }
  readonly onDidChangeUsage: ProviderUsageOperations["onDidChangeUsage"] = (listener) => {
    this.#listeners.add(listener);
    return { dispose: () => this.#listeners.delete(listener) };
  };
  #emit(providerId: string, view?: ProviderUsageView) {
    if (!this.#disposed) for (const listener of this.#listeners) listener({ providerId, view });
  }
  /** Runtime 就绪后启动；UI 生命周期不能决定已保存的自动查询是否执行。 */
  startAutomaticRefresh(): void {
    if (this.#disposed || this.#automaticStarted) return;
    this.#automaticStarted = true;
    this.refreshAutomaticQueries();
  }
  refreshAutomaticQueries(): void {
    if (!this.#automaticStarted || this.#disposed) return;
    const generation = ++this.#scheduleGeneration;
    void this.#store
      .listProviderIds()
      .then((ids) => {
        if (generation !== this.#scheduleGeneration || this.#disposed) return;
        const configured = new Set(ids);
        for (const id of this.#automatic.keys()) if (!configured.has(id)) this.#cancelAutomatic(id);
        for (const id of ids) this.#scheduleAutomatic(id);
      })
      .catch(() => {
        // 不记录私有配置内容或网络异常原文；损坏配置仍由原读取接口明确报错。
        if (!this.#disposed && generation === this.#scheduleGeneration) {
          for (const id of this.#automatic.keys()) this.#cancelAutomatic(id);
          usageLog.warn(undefined, "自动用量查询配置读取失败");
        }
      });
  }
  #cancelAutomatic(providerId: string): void {
    const schedule = this.#automatic.get(providerId);
    if (schedule?.timer) clearTimeout(schedule.timer);
    this.#automatic.delete(providerId);
  }
  #scheduleAutomatic(providerId: string): void {
    if (!this.#automaticStarted || this.#disposed) return;
    this.#cancelAutomatic(providerId);
    const schedule: AutomaticQuerySchedule = {};
    this.#automatic.set(providerId, schedule);
    const current = () => !this.#disposed && this.#automatic.get(providerId) === schedule;
    void (async () => {
      const [stored, provider] = await Promise.all([
        this.#store.read(providerId),
        this.options.resolveProvider(providerId),
      ]);
      if (!current()) return;
      const config = stored.value?.config;
      if (
        !config?.enabled ||
        !config.refreshMinutes ||
        !provider?.enabled ||
        !isApiKeyAccess(provider.config.access)
      ) {
        this.#cancelAutomatic(providerId);
        return;
      }
      const cached = this.#cache.get(providerId);
      const result =
        cached?.revision === stored.revision &&
        cached.binding === providerConnectionBinding(provider.config)
          ? cached.result
          : undefined;
      const now = (this.options.now ?? Date.now)();
      const due = result ? result.queriedAt + config.refreshMinutes * 60000 : now;
      schedule.timer = setTimeout(
        () => {
          if (!current()) return;
          schedule.timer = undefined;
          void this.queryProviderUsage(providerId, true).then(
            () => {
              // 单飞命中或缓存仍新鲜时也继续调度；成功查询已换代的旧回调不能覆盖新截止时间。
              if (current()) this.#scheduleAutomatic(providerId);
            },
            () => {
              if (current()) {
                this.#cancelAutomatic(providerId);
                usageLog.warn(undefined, "自动用量查询未完成");
              }
            },
          );
        },
        Math.max(0, due - now),
      );
      schedule.timer.unref?.();
    })().catch(() => {
      if (current()) {
        this.#cancelAutomatic(providerId);
        usageLog.warn(undefined, "自动用量查询调度失败");
      }
    });
  }
  async #context(providerId: string) {
    if (this.#disposed) throw new Error("用量服务已关闭");
    const [stored, provider] = await Promise.all([
      this.#store.read(providerId),
      this.options.resolveProvider(providerId),
    ]);
    if (!provider || !isApiKeyAccess(provider.config.access))
      throw new Error("该供应商不支持此用量查询入口");
    return { stored, provider, binding: providerConnectionBinding(provider.config) };
  }
  async getProviderUsage(providerId: string): Promise<ProviderUsageView> {
    this.#observed.add(providerId);
    const { stored, binding } = await this.#context(providerId);
    const previous = this.#cache.get(providerId);
    if (previous && (previous.revision !== stored.revision || previous.binding !== binding))
      this.#cache.delete(providerId);
    return {
      revision: stored.revision,
      config: stored.value?.config ?? defaultProviderUsageConfig,
      hasAccessToken: Boolean(stored.value?.accessToken),
      hasSecretKey: Boolean(stored.value?.secretKey),
      result: this.#cache.get(providerId)?.result,
    };
  }
  async saveProviderUsage(input: SaveProviderUsageInput): Promise<ProviderUsageView> {
    await this.#context(input.providerId);
    const config = providerUsageConfigSchema.parse(input.config);
    await this.#store.save({ ...input, config });
    this.#cache.delete(input.providerId);
    const view = await this.getProviderUsage(input.providerId);
    this.#emit(input.providerId, view);
    return view;
  }
  async readProviderUsageSecret(raw: ProviderUsageSecretRequest): Promise<string | undefined> {
    const input = providerUsageSecretRequestSchema.parse(raw);
    const { stored } = await this.#context(input.providerId);
    if (stored.revision !== input.expectedRevision) throw new Error("Usage configuration changed");
    // 指定秘密只进入显式读取响应，不走普通 view、缓存或变更广播。
    return stored.value?.[input.field];
  }
  async queryProviderUsage(providerId: string, automatic = false): Promise<ProviderUsageView> {
    const context = await this.#context(providerId);
    const view = await this.getProviderUsage(providerId);
    const config = view.config;
    if (!config.enabled) return view;
    if (automatic && (!context.provider.enabled || config.refreshMinutes === 0)) return view;
    const now = (this.options.now ?? Date.now)();
    if (automatic && view.result && now - view.result.queriedAt < config.refreshMinutes * 60000)
      return view;
    const key = JSON.stringify([context.stored.revision, context.binding]);
    const pending = this.#pending.get(providerId);
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      const result = await executeProviderUsageQuery({
        provider: context.provider.config,
        entry: context.stored.value!,
        fetchImpl: this.options.fetchImpl,
        signal: this.#lifetime.signal,
      });
      if (this.#disposed)
        return {
          ...view,
          result: {
            status: "error" as const,
            code: "connection-changed" as const,
            queriedAt: Date.now(),
          },
        };
      const latest = await this.#context(providerId);
      if (latest.binding !== context.binding || latest.stored.revision !== context.stored.revision)
        return {
          ...(await this.getProviderUsage(providerId)),
          result: {
            status: "error" as const,
            code: "connection-changed" as const,
            queriedAt: Date.now(),
          },
        };
      this.#cache.set(providerId, {
        revision: context.stored.revision,
        binding: context.binding,
        result,
      });
      const next = { ...view, result };
      this.#emit(providerId, next);
      this.#scheduleAutomatic(providerId);
      return next;
    })();
    this.#pending.set(providerId, { key, promise });
    try {
      return await promise;
    } finally {
      if (this.#pending.get(providerId)?.promise === promise) this.#pending.delete(providerId);
    }
  }
  async testProviderUsage(input: ProviderUsageDraft): Promise<ProviderUsageResult> {
    const context = await this.#context(input.providerId);
    const entry = withUsageCredentials(
      { ...context.stored.value, config: providerUsageConfigSchema.parse(input.config) },
      input.credentials,
    );
    const result = await executeProviderUsageQuery({
      provider: context.provider.config,
      entry,
      fetchImpl: this.options.fetchImpl,
      signal: this.#lifetime.signal,
    });
    if (this.#disposed)
      return { status: "error", code: "connection-changed", queriedAt: Date.now() };
    const latest = await this.#context(input.providerId);
    return latest.binding === context.binding && latest.stored.revision === context.stored.revision
      ? result
      : { status: "error", code: "connection-changed", queriedAt: Date.now() };
  }
  dispose() {
    this.#disposed = true;
    this.#scheduleGeneration++;
    for (const id of this.#automatic.keys()) this.#cancelAutomatic(id);
    this.#lifetime.abort();
    this.#disposeStore();
    this.#store.dispose();
    this.#listeners.clear();
    this.#cache.clear();
  }
  async removeProviderUsage(providerId: string) {
    this.#observed.delete(providerId);
    this.#cache.delete(providerId);
    await this.#store.remove(providerId);
  }
}
