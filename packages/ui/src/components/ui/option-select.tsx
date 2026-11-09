import type { ComponentProps } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** 业务空字符串也是一个真实选项；统一编码后交给 Radix，回调仍只传原业务值。 */
export function OptionSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = "lg",
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "value" | "onChange" | "children"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
}) {
  return (
    <Select
      value={`option:${value}`}
      onValueChange={(next) => onValueChange(next.slice(7))}
      disabled={props.disabled}
    >
      <SelectTrigger {...props} size={size} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={`option:${option.value}`}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
