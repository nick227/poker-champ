import { useEffect, useState } from "react";
import { View } from "react-native";
import { SIDE_BET_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import type { SideBetEntry } from "@/features/table/stores/table.store";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { formatCents } from "@/lib/format";

type SideBetOfferBannerProps = {
  sideBets: Record<string, SideBetEntry>;
  heroUserId?: string;
  onRespond: (interactionId: string, accept: boolean) => void;
};

export function SideBetOfferBanner({ sideBets, heroUserId, onRespond }: SideBetOfferBannerProps) {
  const offer = heroUserId
    ? Object.values(sideBets).find((b) => b.status === "PENDING" && b.recipientUserId === heroUserId)
    : undefined;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // Only restart the countdown when a genuinely different offer takes over — Object.values(sideBets)
    // returns a new array every render, so keying on the whole `offer` object would reset the interval
    // every tick instead of only when interactionId actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.interactionId]);

  if (!offer) return null;

  const entry = SIDE_BET_CATALOG_BY_KEY.get(offer.catalogKey);
  const secondsLeft = offer.expiresAt ? Math.max(0, Math.ceil((offer.expiresAt - now) / 1000)) : null;
  const subjectsLine =
    offer.subjectUserIds && offer.subjectNames
      ? `${offer.subjectNames[0]} vs ${offer.subjectNames[1]}`
      : undefined;

  return (
    <ModalSheet visible blocking={false} onClose={() => {}} title="🎲 Side Bet Offer">
      <View className="ui-stack-3">
        <Text variant="body">
          {offer.initiatorName ?? "A player"} proposes: {entry?.label ?? offer.catalogKey}
        </Text>
        {subjectsLine ? <Text variant="muted">{subjectsLine}</Text> : null}
        <Text variant="label">Stake: {formatCents(offer.stakeCents)}</Text>
        {secondsLeft != null ? <Text variant="muted">Expires in {secondsLeft}s</Text> : null}
        <View className="ui-row ui-inline-2">
          <Button title="Accept" intent="primary" onPress={() => onRespond(offer.interactionId, true)} />
          <Button title="Decline" intent="secondary" onPress={() => onRespond(offer.interactionId, false)} />
        </View>
      </View>
    </ModalSheet>
  );
}
