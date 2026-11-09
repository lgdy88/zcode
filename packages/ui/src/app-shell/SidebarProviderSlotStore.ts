import { useSyncExternalStore } from "react";

/**
 * 侧边栏供应商徽章的投影槽位。
 *
 * footer 注册真实 DOM 节点，composer 工具栏子树通过 portal 投影进来。
 * 用模块级 store 而非 React context：footer 与 composer 的公共祖先是
 * WorkspaceShellLayout 大树，context 会让整棵壳层被牵连重渲染；
 * portal 目标本就不需要参与 props 传导，最小订阅面即可。
 */
let slotElement: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setSidebarProviderSlotElement(element: HTMLElement | null) {
  if (slotElement === element) {
    return;
  }
  slotElement = element;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return slotElement;
}

export function useSidebarProviderSlotElement() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
