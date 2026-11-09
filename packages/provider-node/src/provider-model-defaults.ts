import { readFile } from "node:fs/promises";
import { modelSelectionSchema, type ModelSelection } from "@zcode/shared/model-selection";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";
import { defaultReasoningEffortSchema, type DefaultReasoningEffort } from "@zcode/provider";

interface ModelSelectionPreferences {
  readonly providerDefaults: Readonly<Record<string, ModelSelection>>;
  readonly defaultReasoningEffort?: DefaultReasoningEffort;
}

/** 旁文件只保存模型偏好，避免新字段使旧版严格 Personal 配置解析失败。 */
export async function readProviderModelDefaults(
  filePath: string,
): Promise<Readonly<Record<string, ModelSelection>>> {
  return (await readModelSelectionPreferences(filePath)).providerDefaults;
}

export async function readModelSelectionPreferences(
  filePath: string,
): Promise<ModelSelectionPreferences> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { providerDefaults: {} };
    throw error;
  }
  const file: unknown = JSON.parse(raw);
  if (!file || typeof file !== "object" || Array.isArray(file))
    throw new Error("默认模型配置格式无效");
  const document = file as Record<string, unknown>;
  const defaults = document.providerDefaults;
  if (
    document.schemaVersion !== 1 ||
    Object.keys(document).some(
      (key) => !["schemaVersion", "providerDefaults", "defaultReasoningEffort"].includes(key),
    ) ||
    !defaults ||
    typeof defaults !== "object" ||
    Array.isArray(defaults)
  ) {
    throw new Error("默认模型配置格式无效");
  }
  const result: Record<string, ModelSelection> = Object.create(null);
  for (const [providerId, value] of Object.entries(defaults)) {
    const selection = modelSelectionSchema.parse(value);
    if (selection.providerId !== providerId) throw new Error("默认模型供应商身份不匹配");
    result[providerId] = selection;
  }
  return {
    providerDefaults: result,
    ...(document.defaultReasoningEffort === undefined
      ? {}
      : {
          defaultReasoningEffort: defaultReasoningEffortSchema.parse(
            document.defaultReasoningEffort,
          ),
        }),
  };
}

export async function saveProviderModelDefault(
  filePath: string,
  input: ModelSelection,
): Promise<ModelSelectionPreferences> {
  const selection = modelSelectionSchema.parse(input);
  return withFileLock(filePath, async () => {
    const current = await readModelSelectionPreferences(filePath);
    const next = {
      ...current,
      providerDefaults: { ...current.providerDefaults, [selection.providerId]: selection },
    };
    await atomicWritePrivateTextFile(
      filePath,
      JSON.stringify({ schemaVersion: 1, ...next }, null, 2),
    );
    return next;
  });
}

export async function saveDefaultReasoningEffort(
  filePath: string,
  input: DefaultReasoningEffort,
): Promise<ModelSelectionPreferences> {
  const effort = defaultReasoningEffortSchema.parse(input);
  return withFileLock(filePath, async () => {
    const next = {
      ...(await readModelSelectionPreferences(filePath)),
      defaultReasoningEffort: effort,
    };
    await atomicWritePrivateTextFile(
      filePath,
      JSON.stringify({ schemaVersion: 1, ...next }, null, 2),
    );
    return next;
  });
}
