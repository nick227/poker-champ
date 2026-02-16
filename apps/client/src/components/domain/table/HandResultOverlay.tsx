import { useEffect, useRef } from "react";
import { Animated, Modal, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import { PotWinRing } from "./PotWinEffect";
import { DURATION } from "@/theme/animation";

type Card = { rank: string; suit: string };

type HandResultOverlayProps = {
  visible: boolean;
  winnerName: string;
  winnerCards: Card[];
  opponentCards?: Card[];
  potCents: number;
  onDeal: () => void;
};

export function HandResultOverlay({
  visible,
  winnerName,
  winnerCards,
  opponentCards = [],
  potCents,
  onDeal,
}: HandResultOverlayProps) {
  const lineScale = useRef(new Animated.Value(0.96)).current;
  const lineOpacity = useRef(new Animated.Value(0)).current;
  const potScale = useRef(new Animated.Value(0.96)).current;
  const potOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    lineScale.setValue(0.96);
    lineOpacity.setValue(0);
    potScale.setValue(0.96);
    potOpacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(lineScale, {
          toValue: 1,
          duration: DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.timing(lineOpacity, {
          toValue: 1,
          duration: DURATION.fast,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(potScale, {
          toValue: 1,
          duration: DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.timing(potOpacity, {
          toValue: 1,
          duration: DURATION.fast,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [visible, lineScale, lineOpacity, potScale, potOpacity]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 ui-center bg-bg/90 ui-p-4">
        <View className="w-full max-w-sm ui-surface-elevated ui-p-4">
          <Animated.View
            style={{
              opacity: lineOpacity,
              transform: [{ scale: lineScale }],
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <Text variant="h2" className="text-center text-success">
              {winnerName} {TABLE.wins}
            </Text>
          </Animated.View>
          <Animated.View
            style={{
              opacity: potOpacity,
              transform: [{ scale: potScale }],
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <Text variant="body" className="text-center">
              {formatCents(potCents)}
            </Text>
          </Animated.View>
          <PotWinRing>
            <View className="mb-4 ui-row justify-center ui-inline-1">
              {winnerCards.map((c, i) => (
                <PlayingCard key={i} rank={c.rank} suit={c.suit} />
              ))}
            </View>
          </PotWinRing>
          {opponentCards.length > 0 ? (
            <View className="mb-4 ui-row justify-center ui-inline-1 opacity-70">
              {opponentCards.map((c, i) => (
                <PlayingCard key={i} rank={c.rank} suit={c.suit} />
              ))}
            </View>
          ) : null}
          <Button variant="primary" title={TABLE.deal} onPress={onDeal} />
        </View>
      </View>
    </Modal>
  );
}
