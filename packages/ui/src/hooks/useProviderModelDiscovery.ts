import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderModelDiscoveryResult } from "@zcode/provider";
import { useServices } from "./useServices.js";

/** 目录是一次读取的结果；关闭/连接换代后，旧回执不能重新打开或污染当前弹窗。 */
export function useProviderModelDiscovery({
  providerId,
  connectionKey,
  beforeFetch,
}: {
  providerId: string;
  connectionKey: string;
  beforeFetch?: () => Promise<void>;
}) {
  const { providerSettingsService } = useServices();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProviderModelDiscoveryResult | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const current = useRef({ providerId, connectionKey, providerSettingsService });
  current.current = { providerId, connectionKey, providerSettingsService };
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      generation.current++;
      pending.current = false;
      setLoading(false);
      setResult(null);
    }
    setOpen(next);
  }, []);
  useEffect(() => {
    onOpenChange(false);
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [providerId, connectionKey, providerSettingsService, onOpenChange]);

  const fetchModels = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const request = ++generation.current;
    const owner = current.current;
    setOpen(true);
    setLoading(true);
    setResult(null);
    const isCurrent = () =>
      request === generation.current &&
      owner.providerId === current.current.providerId &&
      owner.connectionKey === current.current.connectionKey &&
      owner.providerSettingsService === current.current.providerSettingsService;
    try {
      await beforeFetch?.();
      if (!isCurrent()) return;
      const next = await providerSettingsService.fetchAvailableModels(providerId);
      if (isCurrent()) setResult(next);
    } catch {
      if (isCurrent()) setResult({ success: false, error: { code: "network" } });
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [beforeFetch, providerId, providerSettingsService]);

  return { open, loading, result, onOpenChange, fetchModels };
}
