import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelSelection } from "@zcode/shared";
import {
  defaultReasoningEffortSchema,
  type DefaultReasoningEffort,
} from "@zcode/provider";
import { logger } from "@/logger.js";
import { useServices } from "@/hooks/useServices.js";
import { useModelSelectionServiceView } from "@/hooks/useModelSelectionView.js";
import {
  resolveDefaultModelSelection,
  resolveDefaultProviderSelection,
} from "@/lib/provider/defaultModelProvider.js";

export interface DefaultModelProviderActions {
  defaultReasoningEffort: DefaultReasoningEffort;
  savingReasoning: boolean;
  reasoningSaveFailed: boolean;
  saveReasoning(effort: DefaultReasoningEffort): Promise<void>;
  configuredProviderId?: string;
  availableProviderIds: ReadonlySet<string>;
  savingProviderId: string | null;
  ready: boolean;
  saveDefault(providerId: string): Promise<void>;
  providerDefaults: Readonly<Record<string, ModelSelection>>;
  availableModels: ReadonlySet<string>;
  saveModelDefault(providerId: string, modelId: string): Promise<void>;
}

/** 设置页只有一份默认选择读取；列表行只消费投影，不各自订阅或保存默认状态。 */
export function useDefaultModelProvider() {
  const { modelSelectionService } = useServices();
  const read = useModelSelectionServiceView(modelSelectionService);
  const view = read.state.status === "ready" ? read.state.view : null;
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savingReasoning, setSavingReasoning] = useState(false);
  const [reasoningSaveFailed, setReasoningSaveFailed] = useState(false);
  const ownerRef = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    ownerRef.current += 1;
    setSavingProviderId(null);
    setSaveFailed(false);
    setSavingReasoning(false);
    setReasoningSaveFailed(false);
    busyRef.current = false;
    return () => {
      ownerRef.current += 1;
    };
  }, [modelSelectionService]);
  const availableProviderIds = useMemo(
    () =>
      new Set(
        view?.providers
          .filter((provider) => resolveDefaultProviderSelection(view, provider.providerId))
          .map((provider) => provider.providerId),
      ),
    [view],
  );
  const saveDefault = useCallback(
    async (providerId: string) => {
      const selection = resolveDefaultProviderSelection(view, providerId);
      if (!selection || busyRef.current) return;
      busyRef.current = true;
      const owner = ownerRef.current;
      setSavingProviderId(providerId);
      setSaveFailed(false);
      try {
        await modelSelectionService.saveConfiguredDefault(selection);
        // 保存返回后主动重读，不能依赖跨窗口事件恰好送达才显示权威默认值。
        if (ownerRef.current === owner) read.reload();
      } catch (error) {
        logger.warn("[DefaultModelProvider] 保存默认供应商失败", { providerId, error });
        if (ownerRef.current === owner) setSaveFailed(true);
      } finally {
        if (ownerRef.current === owner) {
          busyRef.current = false;
          setSavingProviderId(null);
        }
      }
    },
    [modelSelectionService, read.reload, savingProviderId, view],
  );
  const saveModelDefault = useCallback(
    async (providerId: string, modelId: string) => {
      const selection = resolveDefaultModelSelection(view, providerId, modelId);
      if (!selection || busyRef.current) return;
      busyRef.current = true;
      const owner = ownerRef.current;
      setSavingProviderId(providerId);
      setSaveFailed(false);
      try {
        await modelSelectionService.saveProviderDefault(selection);
        if (ownerRef.current === owner) read.reload();
      } catch (error) {
        logger.warn("[DefaultModelProvider] 保存默认模型失败", { providerId, modelId, error });
        if (ownerRef.current === owner) setSaveFailed(true);
      } finally {
        if (ownerRef.current === owner) {
          busyRef.current = false;
          setSavingProviderId(null);
        }
      }
    },
    [modelSelectionService, read.reload, view],
  );
  const availableModels = useMemo(
    () =>
      new Set(
        view?.providers.flatMap((provider) =>
          provider.models
            .filter((model) =>
              resolveDefaultModelSelection(view, provider.providerId, model.modelId),
            )
            .map((model) => JSON.stringify([provider.providerId, model.modelId])),
        ),
      ),
    [view],
  );
  const saveReasoning = useCallback(
    async (input: DefaultReasoningEffort) => {
      const effort = defaultReasoningEffortSchema.parse(input);
      if (busyRef.current) return;
      busyRef.current = true;
      const owner = ownerRef.current;
      setSavingReasoning(true);
      setReasoningSaveFailed(false);
      try {
        await modelSelectionService.saveDefaultReasoningEffort(effort);
        if (ownerRef.current === owner) read.reload();
      } catch (error) {
        logger.warn("[DefaultModelProvider] 保存思考强度失败", { error });
        if (ownerRef.current === owner) setReasoningSaveFailed(true);
      } finally {
        if (ownerRef.current === owner) {
          busyRef.current = false;
          setSavingReasoning(false);
        }
      }
    },
    [modelSelectionService, read.reload],
  );
  const actions: DefaultModelProviderActions = {
    defaultReasoningEffort: view?.defaultReasoningEffort ?? "balanced",
    savingReasoning,
    reasoningSaveFailed,
    saveReasoning,
    configuredProviderId: view?.configuredDefault?.providerId,
    availableProviderIds,
    savingProviderId,
    ready: read.state.status === "ready",
    saveDefault,
    providerDefaults: view?.providerDefaults ?? {},
    availableModels,
    saveModelDefault,
  };
  return actions;
}
