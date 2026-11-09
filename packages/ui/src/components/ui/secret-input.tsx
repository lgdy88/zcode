import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Input, type InputProps } from "./input.js";
import { Button } from "./button.js";
import { cn } from "../lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

type SecretInputProps = Omit<InputProps, "type" | "value"> & {
  value: string;
  secretId?: string;
  loadStoredValue?: () => Promise<string | undefined>;
};

/** 查看结果不进入草稿或 onChange，避免显示原密钥时意外覆盖保存。 */
export function SecretInput({
  value,
  secretId,
  loadStoredValue,
  className,
  disabled,
  onChange,
  ...props
}: SecretInputProps) {
  const { intl } = useZCodeIntl();
  const generated = useId(),
    identity = secretId ?? generated;
  const [visibility, setVisibility] = useState({ identity, shown: false });
  const [loaded, setLoaded] = useState<{ identity: string; value: string }>();
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
  const current = useRef({ identity, value }),
    generation = useRef(0);
  current.current = { identity, value };
  const shown = visibility.identity === identity && visibility.shown;
  useEffect(() => {
    generation.current++;
    setVisibility({ identity, shown: false });
    setLoaded(undefined);
    setLoading(false);
    setFailed(false);
    return () => {
      generation.current++;
    };
  }, [identity]);
  const show = (next: boolean) => setVisibility({ identity, shown: next });
  const toggle = async () => {
    if (loading || disabled) return;
    setFailed(false);
    if (shown) {
      generation.current++;
      setLoaded(undefined);
      show(false);
      return;
    }
    if (value || !loadStoredValue) {
      show(true);
      return;
    }
    const request = ++generation.current;
    setLoading(true);
    try {
      const secret = await loadStoredValue();
      if (
        request !== generation.current ||
        current.current.identity !== identity ||
        current.current.value !== value
      )
        return;
      if (typeof secret !== "string") {
        setFailed(true);
        return;
      }
      setLoaded({ identity, value: secret });
      show(true);
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };
  const label = intl.formatMessage({ id: shown ? "common.hideSecret" : "common.showSecret" });
  return (
    <div className="w-full min-w-0" data-secret-input>
      <div className="relative">
        <Input
          autoComplete="off"
          {...props}
          disabled={disabled}
          value={shown && !value && loaded?.identity === identity ? loaded.value : value}
          type={shown ? "text" : "password"}
          className={cn("pr-9", className)}
          onChange={(event) => {
            generation.current++;
            setLoading(false);
            setLoaded(undefined);
            setFailed(false);
            onChange?.(event);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label={label}
          aria-pressed={shown}
          title={label}
          disabled={disabled || loading}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void toggle()}
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : shown ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="mt-1 text-ui-sm text-destructive">
          {intl.formatMessage({ id: "common.secretReadFailed" })}
        </p>
      )}
    </div>
  );
}
