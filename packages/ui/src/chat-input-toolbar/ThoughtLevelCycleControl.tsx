import { useCallback, useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import {
  type ZCodeConfigOption,
  type ZCodeProvider,
} from "@zcode/shared";
import { TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER } from "@zcode/shared/test-ids";
import { ChevronDown as ChevronDownIcon } from "lucide-react";

function BrainIcon({ className }: { className?: string }) {
  // RCode 同款 ReasoningBrain 轮廓（Material 双脑），上游无此图标。
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5.5c-1-4-6-3.5-6.5.5C2 6.5 1.5 11 4 13c-2 3.5.5 6.5 3.5 6.5 1 3 4.5 2.5 4.5-.5V5.5Zm0 0c1-4 6-3.5 6.5.5 3.5.5 4 5 1.5 7 2 3.5-.5 6.5-3.5 6.5-1 3-4.5 2.5-4.5-.5M6 6c0 2 1 3 2.5 3m9.5-3c0 2-1 3-2.5 3M4 13c1.5-1 3.5-.5 4 1.5m12-1.5c-1.5-1-3.5-.5-4 1.5M7.5 19.5V17m9 2.5V17" />
    </svg>
  );
}
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { ThoughtLevelSlider } from "./ThoughtLevelSlider.js";
import "./ThoughtLevelSlider.css";
import type { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  isCoarseTouchDevice,
  shouldRestoreChatInputFocusAfterPickerClose,
} from "@/lib/pickerFocus.js";
import {
  getThoughtLevelLabel,
  isNoThoughtLevel,
} from "@/chat-input-toolbar/thoughtLevelOptions.js";
import { RollingToolbarLabel } from "@/chat-input-toolbar/RollingToolbarLabel.js";

type ThoughtLevelInteractionMode = "select" | "cycle";

export function ThoughtLevelCycleControl({
  disabled,
  disabledReason,
  composerCollapsePriority,
  interactionMode = "select",
  indicatorClassName,
  intl,
  modelLabel,
  modelPicker,
  emptyLabel,
  showModelLabelInTrigger = false,
  labelVisibilityClassName = "hidden @xl/composer:inline-flex",
  option,
  provider,
  showInvalidCurrentValue = false,
  restoreFocusSelector = '[data-testid="chat-input"]',
  shortcutLabel,
  triggerClassName,
  triggerRef,
  open,
  onOpenChange,
  onCurrentValueCommit,
  onValueChange,
}: {
  disabled?: boolean;
  disabledReason?: string;
  /** 聊天输入框由统一布局 owner 收起文字，其他调用方保留原断点规则。 */
  composerCollapsePriority?: number;
  interactionMode?: ThoughtLevelInteractionMode;
  indicatorClassName?: string;
  intl: ReturnType<typeof useZCodeIntl>["intl"];
  modelLabel?: string;
  modelPicker?: ReactNode;
  emptyLabel?: string;
  showModelLabelInTrigger?: boolean;
  labelVisibilityClassName?: string;
  option: ZCodeConfigOption | null;
  provider?: ZCodeProvider;
  showInvalidCurrentValue?: boolean;
  restoreFocusSelector?: string | null;
  shortcutLabel?: string;
  triggerClassName?: string;
  triggerRef: RefObject<HTMLSpanElement | null>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCurrentValueCommit?: (value: string) => void;
  onValueChange: (value: string) => void;
}) {
  const composerTriggerClassName =
    composerCollapsePriority !== undefined
      ? "group/thought shrink-0 data-[composer-compact=icon]:size-7 data-[composer-compact=icon]:justify-center data-[composer-compact=icon]:gap-0 data-[composer-compact=icon]:p-0"
      : undefined;
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [inlineLabelVisible, setInlineLabelVisible] = useState(true);

  const updateInlineLabelVisible = useCallback((element: HTMLSpanElement | null) => {
    if (!element) {
      return;
    }
    const style = window.getComputedStyle(element);
    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0;
    setInlineLabelVisible(visible);
  }, []);

  // RAF-based debounce to coalesce resize events
  let rafId: number | null = null;
  const debouncedUpdateInlineLabelVisible = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateInlineLabelVisible(labelRef.current);
    });
  };

  const entries = option?.type === "select" ? (option.options ?? []) : [];

  const selectedEntryIndex = entries.findIndex((entry) => entry.value === option?.currentValue);
  const currentValueIsValid = selectedEntryIndex >= 0;
  const shouldShowInvalidCurrentValue =
    showInvalidCurrentValue &&
    !currentValueIsValid &&
    Boolean(String(option?.currentValue ?? "").trim());
  const currentIndex = Math.max(0, selectedEntryIndex);
  const currentEntry = entries[currentIndex] ?? entries[0];
  const isFixedThoughtLevel = entries.length === 1 && currentValueIsValid;

  const currentLabel =
    !entries.length && emptyLabel
      ? emptyLabel
      : shouldShowInvalidCurrentValue
        ? String(option?.currentValue)
        : currentValueIsValid && currentEntry && option
          ? getThoughtLevelLabel(intl, provider, option, currentEntry)
          : intl.formatMessage({ id: "chat.toolbar.thoughtLevel.placeholder" });
  const tooltipTitle = intl.formatMessage({
    id: "chat.toolbar.thoughtLevel.tooltip",
  });
  const effectiveTooltipTitle =
    disabledReason ?? (inlineLabelVisible ? tooltipTitle : currentLabel);
  const triggerAriaLabel =
    showModelLabelInTrigger && modelLabel
      ? `${modelLabel}${entries.length ? ` ${currentLabel}` : ""}`
      : currentLabel;

  useEffect(() => {
    const labelElement = labelRef.current;
    if (!labelElement) {
      return;
    }

    updateInlineLabelVisible(labelElement);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            debouncedUpdateInlineLabelVisible();
          });
    observer?.observe(labelElement);
    if (labelElement.parentElement) {
      observer?.observe(labelElement.parentElement);
    }
    window.addEventListener("resize", debouncedUpdateInlineLabelVisible);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", debouncedUpdateInlineLabelVisible);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [currentLabel, labelVisibilityClassName]);

  // 配置顺序不再经过名称排序，关闭项可能位于任意位置；只计算当前项之前的非关闭项。
  // 未选／失效及关闭值始终为零进度，不能把缺失选择投影成首档。
  const thinkingEntries = entries.filter((entry) => !isNoThoughtLevel(entry));
  const activeDotCount =
    !currentValueIsValid || !currentEntry || isNoThoughtLevel(currentEntry)
      ? 0
      : thinkingEntries.indexOf(currentEntry) + 1;
  const dotCount = Math.max(1, thinkingEntries.length);
  const progressPercent = (activeDotCount / dotCount) * 100;

  if (
    (!option || option.type !== "select" || entries.length === 0 || !currentEntry) &&
    !modelPicker
  ) {
    return null;
  }

  const handleClick = () => {
    const nextIndex = !currentValueIsValid ? 0 : (currentIndex + 1) % entries.length;
    const nextEntry = entries[nextIndex];
    if (!nextEntry) {
      return;
    }
    onValueChange(nextEntry.value);
  };

  const triggerContent = (
    <>
      <BrainIcon
        className={cn(
          "pointer-events-none size-4 text-current",
          showModelLabelInTrigger && modelLabel
            ? "hidden group-data-[composer-compact]/thought:block"
            : undefined,
          // "inline-flex @lg/composer:hidden",
        )}
      />
      {showModelLabelInTrigger && modelLabel ? (
        <span className="min-w-0 max-w-48 truncate font-mono font-medium group-data-[composer-compact]/thought:hidden">
          {modelLabel}
        </span>
      ) : null}
      <span
        className={cn(
          "relative w-1 self-stretch overflow-hidden rounded-full bg-current/10",
          composerCollapsePriority !== undefined
            ? "hidden group-data-[composer-compact=true]/thought:inline-flex"
            : "hidden @sm/composer:inline-flex @xl/composer:hidden",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute bottom-0 left-0 w-full rounded-full bg-success transition-[height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            progressPercent > 0 ? "min-h-1" : undefined,
          )}
          style={{ height: `${progressPercent}%` }}
        />
      </span>
      <span
        ref={labelRef}
        className={cn(
          "min-w-0 whitespace-nowrap",
          labelVisibilityClassName,
          composerCollapsePriority !== undefined && "group-data-[composer-compact]/thought:hidden",
          showModelLabelInTrigger ? "text-foreground-subtle" : undefined,
          showModelLabelInTrigger && !entries.length ? "hidden" : undefined,
        )}
      >
        <RollingToolbarLabel label={currentLabel} />
      </span>
    </>
  );

  if (isFixedThoughtLevel && !modelPicker) {
    return (
      <ControlHintTooltip title={effectiveTooltipTitle} triggerRef={triggerRef}>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-lg px-1.5 py-1.5 text-ui-base text-foreground",
            composerTriggerClassName,
            triggerClassName,
          )}
          aria-label={triggerAriaLabel}
          data-thought-level-fixed="true"
          data-composer-thought-control={composerCollapsePriority !== undefined || undefined}
          data-composer-collapse-priority={composerCollapsePriority}
          data-testid={TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER}
        >
          {/* 单档模型（如 Kimi K3）没有可切换状态，不能继续渲染带箭头的 Select。*/}
          {triggerContent}
        </span>
      </ControlHintTooltip>
    );
  }

  if (interactionMode === "select") {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <ControlHintTooltip
          title={effectiveTooltipTitle}
          shortcut={shortcutLabel}
          triggerRef={triggerRef}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              className={cn(
                "gap-1 rounded-lg px-1.5 py-1.5 text-ui-base",
                composerTriggerClassName,
                triggerClassName,
              )}
              aria-label={triggerAriaLabel}
              data-chat-toolbar-popover-trigger="true"
              data-composer-thought-control={composerCollapsePriority !== undefined || undefined}
              data-composer-collapse-priority={composerCollapsePriority}
              data-testid={TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER}
            >
              {triggerContent}
              <ChevronDownIcon
                className={cn(
                  "pointer-events-none size-3.5 text-foreground-subtle",
                  indicatorClassName,
                  composerCollapsePriority !== undefined &&
                    "group-data-[composer-compact]/thought:hidden",
                )}
              />
            </Button>
          </PopoverTrigger>
        </ControlHintTooltip>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="w-64 max-w-[calc(100vw-1rem)] p-3"
          aria-label={tooltipTitle}
          onCloseAutoFocus={(event) => {
            if (!restoreFocusSelector) return;
            event.preventDefault();
            if (
              shouldRestoreChatInputFocusAfterPickerClose({
                isCoarseTouchDevice: isCoarseTouchDevice(),
              })
            ) {
              document.querySelector<HTMLElement>(restoreFocusSelector)?.focus();
            }
          }}
        >
          <ThoughtLevelSlider
            key={JSON.stringify([
              provider,
              modelLabel,
              option?.id,
              entries.map((entry) => entry.value),
            ])}
            entries={entries.map((entry) => ({
              value: entry.value,
              label: option
                ? getThoughtLevelLabel(intl, provider, option, entry)
                : String(entry.value),
            }))}
            currentValue={String(option?.currentValue ?? "")}
            currentLabel={currentLabel}
            label={tooltipTitle}
            modelLabel={modelLabel}
            modelPicker={modelPicker}
            disabled={disabled}
            onValueChange={onValueChange}
            onCurrentValueCommit={onCurrentValueCommit}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <ControlHintTooltip
      title={effectiveTooltipTitle}
      shortcut={shortcutLabel}
      triggerRef={triggerRef}
    >
      <Button
        type="button"
        variant="ghost"
        size="default"
        disabled={disabled}
        data-chat-toolbar-popover-trigger="true"
        data-composer-thought-control={composerCollapsePriority !== undefined || undefined}
        data-composer-collapse-priority={composerCollapsePriority}
        data-testid={TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER}
        className={cn(
          "gap-1 rounded-lg px-1.5 py-1.5 text-ui-base",
          composerTriggerClassName,
          triggerClassName,
        )}
        aria-label={triggerAriaLabel}
        onClick={handleClick}
      >
        {triggerContent}
      </Button>
    </ControlHintTooltip>
  );
}
