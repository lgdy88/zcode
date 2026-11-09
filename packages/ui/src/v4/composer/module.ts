/**
 * ui-rcode-provider 模块清单（architecture-governance managed 模块）。
 * 层：ui。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const uiRcodeProviderModule = {
  id: "ui-rcode-provider",
  requires: ["gen-ui", "image-preview-editor", "plugin-ui", "project-sidebar", "project-workflow", "provider", "rpc", "services", "shared", "side-pane-full-view", "ui", "ui-file-menu", "workspace-plugin-preview"],
  provides: ["ui-rcode-provider"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
