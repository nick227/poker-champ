import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { CHIP_STACK, CHIP_TIERS } from "../tokens/avatar.tokens";

/**
 * Small static chip-stack visual for a seat's current round bet, replacing a
 * plain "Bet $2" text row. There is no existing chip-travel token component
 * to reuse here — `apps/client/src/features/table/animations/layers/` has no
 * ChipToken.tsx in this repo (confirmed via search); the only "chip" visuals
 * are ChipButton.tsx (an action-bar preset button, not a chip token) and the
 * slot-machine domain's unrelated Chip.tsx. So this is a new, small,
 * purpose-built visual rather than a reuse — see report for detail.
 *
 * Discs are circular Views with a dashed rim (RN's `borderStyle: "dashed"`)
 * to read as poker-chip edge spots, stacked with a vertical offset. Color
 * tier is a display-only heuristic bucketed by bet size, not a real
 * denomination system.
 */
export type ChipStackProps = {
  cents: number;
  /** Pre-formatted label (BB display mode, currency, etc.) */
  label: string;
  testID?: string;
};

function tierForCents(cents: number) {
  return CHIP_TIERS.find((tier) => cents <= tier.maxCents) ?? CHIP_TIERS[CHIP_TIERS.length - 1];
}

export function ChipStack({ cents, label, testID }: ChipStackProps) {
  const tier = tierForCents(Math.max(0, cents));
  const discCount = cents <= 0 ? 1 : Math.min(CHIP_STACK.MAX_DISCS, 1 + Math.floor(Math.log10(Math.max(1, cents / 100)) + 1));
  const discs = Array.from({ length: discCount }, (_, i) => i);
  const stackHeight = CHIP_STACK.DISC_SIZE + (discCount - 1) * CHIP_STACK.DISC_STEP;

  return (
    <View
      data-testid={testID ?? "chip-stack"}
      data-bet-cents={String(cents)}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <View style={{ width: CHIP_STACK.DISC_SIZE, height: stackHeight, justifyContent: "flex-end" }}>
        {discs.map((i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              bottom: i * CHIP_STACK.DISC_STEP,
              width: CHIP_STACK.DISC_SIZE,
              height: CHIP_STACK.DISC_SIZE,
              borderRadius: CHIP_STACK.DISC_SIZE / 2,
              backgroundColor: tier.bg,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: tier.rim,
              boxShadow: [
                { offsetX: 0, offsetY: 1, blurRadius: 2, color: "hsla(0, 0%, 0%, 0.4)" },
              ],
            }}
          />
        ))}
      </View>
      <Text
        variant="muted"
        allowFontScaling={false}
        className="font-semibold"
        style={{ fontSize: 12 }}
      >
        {label}
      </Text>
    </View>
  );
}
