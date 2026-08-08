import { View, StyleSheet } from "react-native";
import { ChipToken } from "@/features/table/animations/layers/ChipToken";
import { computePotStackColumns, computePotStackHeight } from "./potChipStack.logic";

export type PotChipStackProps = {
  potCents: number;
};

const CHIP_SIZE = 14;
/** Vertical overlap between stacked discs so they read as a physical stack, not a loose pile. */
const CHIP_OVERLAP = CHIP_SIZE * 0.55;

/**
 * Small static chip-stack graphic shown next to the pot amount. Reuses ChipToken — the same
 * chip visual already built for the chip-travel FX layer — rather than inventing a new chip
 * look. Column/height count scales (clamped, log-ish) with pot size; purely decorative and
 * static, so it's cheap to render on every hand.
 */
export function PotChipStack({ potCents }: PotChipStackProps) {
  const columns = computePotStackColumns(potCents);
  if (columns <= 0) return null;
  const chipsPerColumn = computePotStackHeight(potCents);

  return (
    <View testID="pot-chip-stack" collapsable={false} style={styles.row} pointerEvents="none">
      {Array.from({ length: columns }).map((_, columnIndex) => (
        <View key={columnIndex} testID="pot-chip-stack-column" collapsable={false} style={styles.column}>
          {Array.from({ length: chipsPerColumn }).map((__, chipIndex) => (
            <View
              key={chipIndex}
              collapsable={false}
              style={chipIndex === 0 ? undefined : { marginTop: -CHIP_OVERLAP }}
            >
              <ChipToken size={CHIP_SIZE} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  column: {
    flexDirection: "column",
    alignItems: "center",
  },
});
