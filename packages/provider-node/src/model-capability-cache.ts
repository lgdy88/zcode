import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";
import { z } from "zod";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";
import { isApiKeyAccess, type ProviderConfigObject } from "@zcode/provider";
import type { DiscoveredProviderModel } from "@zcode/provider";

const known = z
  .object({
    status: z.literal("known"),
    source: z.enum(["provider", "models-dev", "builtin"]),
    control: z.enum(["effort", "toggle", "fixed"]),
    levels: z
      .array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/))
      .min(1)
      .max(32),
    adaptive: z.boolean().optional(),
    referenceProvider: z.string().optional(),
  })
  .strict();
const unknown = z
  .object({
    status: z.literal("unknown"),
    source: z.literal("unknown"),
    referenceBlocked: z.boolean().optional(),
  })
  .strict();
const model = z
  .object({
    id: z.string().min(1),
    ownedBy: z.string().optional(),
    reasoning: z.union([known, unknown]).optional(),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    providers: z.record(
      z.string(),
      z
        .object({
          binding: z.string().regex(/^[a-f0-9]{64}$/),
          models: z.array(model),
          fetchedAt: z.number(),
        })
        .strict(),
    ),
  })
  .strict();
export type ProviderCapabilityCache = z.infer<typeof schema>;

export function modelCapabilityConnectionBinding(config: ProviderConfigObject): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: config.api?.type,
        baseUrl: config.api?.baseUrl?.trim().replace(/\/+$/, ""),
        headers: Object.entries(config.api?.headers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        key: isApiKeyAccess(config.access) ? config.access.apiKey : null,
      }),
    )
    .digest("hex");
}
export function capabilityCacheRevision(cache: ProviderCapabilityCache): string {
  return createHash("sha256").update(JSON.stringify(cache)).digest("hex");
}

/** 缓存没有个人配置写权限；只持有公开能力与不可逆连接摘要。 */
export class ProviderModelCapabilityCacheStore {
  readonly #listeners = new Set<() => void>();
  #watcher: FSWatcher | undefined;
  #watchStart: Promise<void> | undefined;
  #disposed = false;
  #watchError: Error | undefined;
  constructor(readonly filePath: string) {}
  onDidChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async read(): Promise<ProviderCapabilityCache> {
    if (this.#disposed) throw new Error("Model capability cache disposed");
    await this.#startWatch();
    if (this.#watchError) throw this.#watchError;
    try {
      return schema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, providers: {} };
      throw new Error("Model capability cache is invalid");
    }
  }
  async save(
    providerId: string,
    binding: string,
    models: readonly DiscoveredProviderModel[],
    isCurrent: () => Promise<boolean>,
  ): Promise<boolean> {
    return withFileLock(this.filePath, async () => {
      const current = await this.read();
      if (this.#disposed || !(await isCurrent())) return false;
      const next = schema.parse({
        ...current,
        providers: {
          ...current.providers,
          [providerId]: { binding, models, fetchedAt: Date.now() },
        },
      });
      await atomicWritePrivateTextFile(this.filePath, JSON.stringify(next));
      if (!this.#disposed) this.#emit();
      return true;
    });
  }
  #emit() {
    for (const listener of this.#listeners) listener();
  }
  #startWatch(): Promise<void> {
    if (this.#watchStart) return this.#watchStart;
    this.#watchStart = (async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      if (this.#disposed) return;
      this.#watcher = watch(dirname(this.filePath), { persistent: false }, (_event, file) => {
        if (!this.#disposed && file?.toString() === basename(this.filePath)) this.#emit();
      });
      this.#watcher.on("error", () => {
        this.#watchError = new Error("Model capability cache watch failed");
        if (!this.#disposed) this.#emit();
      });
    })();
    return this.#watchStart;
  }
  dispose() {
    this.#disposed = true;
    this.#watcher?.close();
    this.#listeners.clear();
  }
}
