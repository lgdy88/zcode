import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";
import { z } from "zod";
import {
  providerUsageConfigSchema,
  type ProviderUsageCredentialsUpdate,
  type SaveProviderUsageInput,
} from "@zcode/provider";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";

const entry = z
  .object({
    // 已保存的旧范围字段只在持久化入口迁移；查询合同统一为账户余额，保留其他字段及凭据。
    config: z.preprocess((value) => {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "newApiMode")
      ) {
        const config = { ...value } as Record<string, unknown>;
        delete config.newApiMode;
        return config;
      }
      return value;
    }, providerUsageConfigSchema),
    accessToken: z.string().max(8192).optional(),
    secretKey: z.string().max(8192).optional(),
  })
  .strict();
const schema = z.object({ version: z.literal(1), providers: z.record(z.string(), entry) }).strict();
export type UsageStoredEntry = z.infer<typeof entry>;
const revision = (value: UsageStoredEntry | undefined) =>
  createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
export function withUsageCredentials(
  value: UsageStoredEntry,
  update?: ProviderUsageCredentialsUpdate,
): UsageStoredEntry {
  const next = { ...value };
  for (const key of ["accessToken", "secretKey"] as const) {
    if (update?.[key] === null) delete next[key];
    else if (update?.[key] !== undefined) next[key] = update[key];
  }
  return entry.parse(next);
}
/** 额外查询凭据只归私有文件所有；RPC 视图不返回它们的值。 */
export class ProviderUsageStore {
  #watcher: FSWatcher | undefined;
  #ready: Promise<void> | undefined;
  #disposed = false;
  #watchError: Error | undefined;
  readonly #listeners = new Set<() => void>();
  constructor(readonly filePath: string) {}
  onDidChange(listener: () => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async #prepare() {
    this.#ready ??= (async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      if (this.#disposed) return;
      this.#watcher = watch(dirname(this.filePath), { persistent: false }, (_event, file) => {
        if (file?.toString() === basename(this.filePath))
          for (const listener of this.#listeners) listener();
      });
      this.#watcher.on("error", () => {
        this.#watchError = new Error("用量配置文件监听失败");
        for (const listener of this.#listeners) listener();
      });
    })();
    await this.#ready;
  }
  async #read() {
    if (this.#disposed) throw new Error("Provider usage store disposed");
    await this.#prepare();
    if (this.#watchError) throw this.#watchError;
    try {
      return schema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1 as const, providers: {} };
      throw new Error("供应商用量配置损坏，请检查本地配置文件");
    }
  }
  async read(providerId: string) {
    const data = await this.#read();
    // Provider ID 允许普通字符串；不能把 Object 原型成员当作已保存配置参与 revision。
    const value = Object.hasOwn(data.providers, providerId)
      ? data.providers[providerId]
      : undefined;
    return { value, revision: revision(value) };
  }
  /** 调度只枚举身份；配置和凭据继续经原私有 read 入口读取。 */
  async listProviderIds(): Promise<string[]> {
    return Object.keys((await this.#read()).providers);
  }
  async save(input: SaveProviderUsageInput) {
    return withFileLock(this.filePath, async () => {
      const data = await this.#read();
      const previous = Object.hasOwn(data.providers, input.providerId)
        ? data.providers[input.providerId]
        : undefined;
      if (revision(previous) !== input.expectedRevision)
        throw new Error("用量配置已变化，请重新打开后保存");
      const value = withUsageCredentials({ ...previous, config: input.config }, input.credentials);
      if (this.#disposed) throw new Error("Provider usage store disposed");
      const next = schema.parse({
        ...data,
        providers: { ...data.providers, [input.providerId]: value },
      });
      await atomicWritePrivateTextFile(this.filePath, JSON.stringify(next, null, 2));
      for (const listener of this.#listeners) listener();
      return { value, revision: revision(value) };
    });
  }
  async remove(providerId: string) {
    await withFileLock(this.filePath, async () => {
      const data = await this.#read();
      if (!Object.hasOwn(data.providers, providerId)) return;
      const providers = { ...data.providers };
      delete providers[providerId];
      await atomicWritePrivateTextFile(
        this.filePath,
        JSON.stringify({ ...data, providers }, null, 2),
      );
      for (const listener of this.#listeners) listener();
    });
  }
  dispose() {
    this.#disposed = true;
    this.#watcher?.close();
    this.#listeners.clear();
  }
}
