import type { ReactNode } from "react";
import { Platform, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { ChipButton } from "@/components/base/ChipButton";
import { Text } from "@/components/base/Text";
import { PLACEHOLDER_COLOR } from "@/theme/colors";
import {
  HOUR12_OPTIONS,
  MINUTE_OPTIONS,
  formatSchedulePreview,
  todayDateYmd,
  type Meridiem,
  type TournamentStartSchedule,
} from "@/lib/tournament-start-schedule";

type TournamentStartScheduleFieldsProps = {
  value: TournamentStartSchedule;
  onChange: (value: TournamentStartSchedule) => void;
};

function DatePickerField({
  value,
  onChange,
  minDate,
}: {
  value: string;
  onChange: (dateYmd: string) => void;
  minDate: string;
}) {
  const webProps: TextInputProps =
    Platform.OS === "web"
      ? ({ type: "date", min: minDate } as TextInputProps & { type: string; min?: string })
      : {};

  return (
    <View className="ui-stack-2 bg-panel rounded-lg overflow-hidden">
      <Text className="ml-4 mt-2" variant="muted">
        Start date
      </Text>
      <TextInput
        {...webProps}
        value={value}
        onChangeText={onChange}
        placeholder={Platform.OS === "web" ? undefined : "YYYY-MM-DD"}
        placeholderTextColor={PLACEHOLDER_COLOR}
        className="flex-1 py-3 px-4 text-text min-w-0"
        accessibilityLabel="Tournament start date"
      />
    </View>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="ui-stack-2">
      <Text variant="muted">{label}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

export function TournamentStartScheduleFields({ value, onChange }: TournamentStartScheduleFieldsProps) {
  const preview = formatSchedulePreview(value);
  const minDate = todayDateYmd();

  const patch = (partial: Partial<TournamentStartSchedule>) => onChange({ ...value, ...partial });

  return (
    <View className="ui-stack-3">
      <DatePickerField value={value.dateYmd} onChange={(dateYmd) => patch({ dateYmd })} minDate={minDate} />
      <View className="ui-stack-3 rounded-lg bg-panel p-4">
        <Text variant="muted">Start time (local)</Text>
        <ChipRow label="Hour">
          {HOUR12_OPTIONS.map((hour) => (
            <ChipButton
              key={hour}
              title={String(hour)}
              selected={value.hour12 === hour}
              onPress={() => patch({ hour12: hour })}
            />
          ))}
        </ChipRow>
        <ChipRow label="Minute">
          {MINUTE_OPTIONS.map((minute) => (
            <ChipButton
              key={minute}
              title={String(minute).padStart(2, "0")}
              selected={value.minute === minute}
              onPress={() => patch({ minute })}
            />
          ))}
        </ChipRow>
        <ChipRow label="AM / PM">
          {(["AM", "PM"] as Meridiem[]).map((meridiem) => (
            <ChipButton
              key={meridiem}
              title={meridiem}
              selected={value.meridiem === meridiem}
              onPress={() => patch({ meridiem })}
              className="min-w-[72px]"
            />
          ))}
        </ChipRow>
      </View>
      {preview ? (
        <Text variant="body" className="text-muted">
          Scheduled for {preview}
        </Text>
      ) : null}
    </View>
  );
}
