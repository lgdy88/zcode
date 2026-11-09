import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProviderUsageView,
  ProviderUsageDraft,
  SaveProviderUsageInput,
  ProviderUsageSecretRequest,
} from "@zcode/provider";
import { useServices } from "./useServices.js";

/** Host 唯一持有自动查询与结果；UI 只订阅、手动查询及保存草稿。 */
export function useProviderUsage(input: {
  providerId: string;
  connectionKey: string;
  beforeQuery: () => Promise<void>;
}) {
  const { providerSettingsService: service } = useServices();
  const [view, setView] = useState<ProviderUsageView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const generation = useRef(0),
    before = useRef(input.beforeQuery);
  before.current = input.beforeQuery;
  useEffect(() => {
    const current = ++generation.current;
    setView(null);
    setError("");
    setLoading(false);
    let readSequence = 0;
    const read = () => {
      const serial = ++readSequence;
      void service.getProviderUsage(input.providerId).then(
        (next) => {
          if (current === generation.current && serial === readSequence) {
            setView(next);
            setError("");
          }
        },
        (error) => {
          if (current === generation.current && serial === readSequence)
            setError(error instanceof Error ? error.message : "Error");
        },
      );
    };
    const subscription = service.onDidChangeUsage?.((event) => {
      if (event.providerId === input.providerId) {
        if (event.view && current === generation.current) {
          // 启动自动补查可能先于初始读取完成；旧快照不能把新余额盖回“未查询”。
          readSequence++;
          setView(event.view);
          setError("");
        } else read();
      }
    });
    read();
    return () => {
      generation.current++;
      subscription?.dispose();
    };
  }, [service, input.providerId, input.connectionKey]);
  const refresh = useCallback(async () => {
    const current = generation.current;
    setLoading(true);
    try {
      await before.current();
      if (current !== generation.current) return;
      const next = await service.queryProviderUsage(input.providerId);
      if (current === generation.current) {
        setView(next);
        setError("");
      }
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : "Error");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [service, input.providerId]);
  const save = useCallback(
    async (input: SaveProviderUsageInput) => {
      await before.current();
      const next = await service.saveProviderUsage(input);
      setView(next);
      return next;
    },
    [service],
  );
  const test = useCallback(
    async (input: ProviderUsageDraft) => {
      await before.current();
      return service.testProviderUsage(input);
    },
    [service],
  );
  const readSecret = useCallback(
    (input: ProviderUsageSecretRequest) => service.readProviderUsageSecret(input),
    [service],
  );
  return { view, error, loading, refresh, save, test, readSecret };
}
