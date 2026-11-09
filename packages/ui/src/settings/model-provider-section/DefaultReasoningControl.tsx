import { defaultReasoningEffortSchema } from "@zcode/provider";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { OptionSelect } from "@/components/ui/option-select.js";
import type { DefaultModelProviderActions } from "@/hooks/useDefaultModelProvider.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function DefaultReasoningControl({ actions }: { actions: DefaultModelProviderActions }) {
  const { intl } = useZCodeIntl();
  const text = (key: string) =>
    intl.formatMessage({ id: `settings.modelProvider.defaultReasoning.${key}` });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 whitespace-nowrap text-ui-base">
        <ControlHintTooltip title={text("help")}>
          <span>{text("label")}</span>
        </ControlHintTooltip>
        <OptionSelect
          aria-label={text("label")}
          data-testid="model-provider-default-reasoning"
          size="default"
          className="min-w-20"
          value={actions.defaultReasoningEffort}
          disabled={!actions.ready || actions.savingReasoning || Boolean(actions.savingProviderId)}
          onValueChange={(value) =>
            void actions.saveReasoning(defaultReasoningEffortSchema.parse(value))
          }
          options={defaultReasoningEffortSchema.options.map((value) => ({
            value,
            label: text(value),
          }))}
        />
      </div>
      {actions.reasoningSaveFailed && (
        <span role="alert" className="text-ui-xs text-destructive">
          {text("saveFailed")}
        </span>
      )}
    </div>
  );
}
