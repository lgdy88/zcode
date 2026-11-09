import { useEffect, useState, type ReactNode } from "react";
import { Slider } from "radix-ui";
import { cn } from "@/components/lib/utils.js";

/** 仅保存拖动预览；松开后把真实档位交还原配置所有者。 */
export function ThoughtLevelSlider({
  entries,
  currentValue,
  currentLabel,
  label,
  modelLabel,
  modelPicker,
  disabled,
  onValueChange,
  onCurrentValueCommit,
}: {
  entries: readonly { value: string; label: string }[];
  currentValue: string;
  currentLabel: string;
  label: string;
  modelLabel?: string;
  modelPicker?: ReactNode;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  onCurrentValueCommit?: (value: string) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // 外部配置更新后不能继续展示旧拖动值；实际选择仍完全由调用方控制。
  useEffect(() => setPreviewIndex(null), [currentValue]);
  const selectedIndex = entries.findIndex((entry) => entry.value === currentValue);
  const index = previewIndex ?? Math.max(0, selectedIndex);
  const hasSelection = previewIndex !== null || selectedIndex >= 0;
  const previewLabel = hasSelection ? entries[index]?.label : currentLabel;
  const commit = (nextIndex: number) => {
    const entry = entries[nextIndex];
    if (disabled || !entry) return;
    setPreviewIndex(null);
    if (entry.value === currentValue) onCurrentValueCommit?.(entry.value);
    else onValueChange(entry.value);
  };
  return (
    <div
      className="thought-level-slider space-y-2"
      data-selection-empty={!hasSelection || undefined}
      data-highest={hasSelection && entries.length > 1 && index === entries.length - 1}
      data-disabled={disabled || undefined}
    >
      <div className="text-center">
        <div className="text-ui-base font-semibold text-(--thought-label)" aria-live="polite">
          {previewLabel}
        </div>
        <div className="flex min-w-0 justify-center text-ui-sm text-foreground-subtle">
          {modelPicker ?? <span className="truncate">{modelLabel ?? label}</span>}
        </div>
      </div>
      {entries.length > 1 ? (
        <Slider.Root
          className="relative flex h-8 w-full touch-none select-none items-center data-disabled:opacity-50"
          min={0}
          max={entries.length - 1}
          step={1}
          value={[index]}
          disabled={disabled}
          onValueChange={([nextIndex]) => setPreviewIndex(nextIndex ?? null)}
          onValueCommit={([nextIndex]) => {
            if (nextIndex !== undefined) commit(nextIndex);
          }}
          onPointerCancel={() => setPreviewIndex(null)}
          onPointerUp={() => {
            // Radix 不提交未移动的 thumb；首次明确点击第一档及显式重选仍需交给配置 owner。
            if (index === Math.max(0, selectedIndex)) commit(index);
          }}
          onKeyDown={(event) => {
            if (selectedIndex < 0 && event.key === "Home") commit(0);
          }}
          data-testid="thought-level-slider-track"
        >
          <Slider.Track className="relative h-6 w-full overflow-hidden rounded-full bg-foreground/10">
            {hasSelection ? (
              <Slider.Range className="thought-level-range absolute h-full rounded-full" />
            ) : null}
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-between px-2.5"
            >
              {entries.map((entry, entryIndex) => (
                <span
                  key={entry.value}
                  data-thought-level-tick={entry.value}
                  className={cn(
                    "size-1 rounded-full",
                    hasSelection && entryIndex <= index ? "invisible" : "bg-foreground/25",
                  )}
                />
              ))}
            </span>
          </Slider.Track>
          <Slider.Thumb
            className="block size-7 rounded-full border border-border bg-background shadow-control outline-none focus-visible:ring-2 focus-visible:ring-(--thought-accent) focus-visible:ring-offset-2"
            aria-label={label}
            aria-valuetext={previewLabel}
          />
        </Slider.Root>
      ) : null}
    </div>
  );
}
