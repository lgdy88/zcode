import { createContext, useContext } from "react";
import type { DefaultModelProviderActions } from "@/hooks/useDefaultModelProvider.js";

/** 深层模型行复用设置页唯一订阅，不为每行建立服务和写入状态。 */
export const DefaultModelActionsContext = createContext<DefaultModelProviderActions | undefined>(
  undefined,
);
export const useDefaultModelActions = () => useContext(DefaultModelActionsContext);
