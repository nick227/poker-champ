import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { GIFT_CATALOG, SIDE_BET_CATALOG, type GiftCatalogEntry, type SideBetCatalogEntry } from "@poker-champ/realtime-contract";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { Slider } from "@/components/base/Slider";
import { formatCents } from "@/lib/format";

export type SubjectCandidate = { userId: string; name: string };

type Step = "menu" | "gift" | "sidebet-list" | "sidebet-config";

type SeatInteractionSheetProps = {
  visible: boolean;
  onClose: () => void;
  targetUserId?: string;
  targetName: string;
  bigBlindCents?: number;
  /** Other seated players eligible as bet subjects — never the hero or this sheet's target
   *  (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §9/§10: no own-hand bets). */
  availableSubjects?: SubjectCandidate[];
  onSendGift: (catalogKey: string) => void;
  onProposeSideBet: (input: {
    catalogKey: string;
    stakeCents: number;
    subjectUserIds?: [string, string];
    predictedSubjectUserId?: string;
  }) => void;
};

/**
 * Single seat-based entry point for Gifts and Side Bets, opened from the small "+" on an
 * occupied opponent/bot seat (SeatPlate). Deliberately one sheet with internal step state,
 * not tabs or nested modals — "menu" -> "gift" | "sidebet-list" -> "sidebet-config", with a
 * back affordance at each non-menu step. Supersedes the old Gift/Bet tabs on PlayerHistoryPopup.
 */
export function SeatInteractionSheet({
  visible,
  onClose,
  targetUserId,
  targetName,
  bigBlindCents,
  availableSubjects = [],
  onSendGift,
  onProposeSideBet,
}: SeatInteractionSheetProps) {
  const [step, setStep] = useState<Step>("menu");
  const [selectedGiftKey, setSelectedGiftKey] = useState<string | null>(null);
  const sendingGiftRef = useRef(false);

  const [selectedBetKey, setSelectedBetKey] = useState<string | null>(null);
  const [subjectA, setSubjectA] = useState<string | null>(null);
  const [subjectB, setSubjectB] = useState<string | null>(null);
  const [predicted, setPredicted] = useState<string | null>(null);
  const [stakeBigBlinds, setStakeBigBlinds] = useState(1);
  const proposingBetRef = useRef(false);

  const selectedBetEntry = SIDE_BET_CATALOG.find((b) => b.id === selectedBetKey) ?? null;
  const canBet = Boolean(targetUserId && bigBlindCents);

  useEffect(() => {
    if (!selectedBetEntry) return;
    setStakeBigBlinds(selectedBetEntry.minStakeBigBlinds);
    setSubjectA(null);
    setSubjectB(null);
    setPredicted(null);
  }, [selectedBetEntry]);

  const resetAll = () => {
    setStep("menu");
    setSelectedGiftKey(null);
    sendingGiftRef.current = false;
    setSelectedBetKey(null);
    setSubjectA(null);
    setSubjectB(null);
    setPredicted(null);
    proposingBetRef.current = false;
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSendGift = (catalogKey: string) => {
    // Same double-tap guard as the original Gift tab (docs/GIFTS_AND_SIDE_BETS_DESIGN.md
    // checkpoint testing) — a ref, not just state, since two taps can land before a re-render.
    if (!targetUserId || sendingGiftRef.current) return;
    sendingGiftRef.current = true;
    onSendGift(catalogKey);
    handleClose();
  };

  const betReady = (() => {
    if (!selectedBetEntry || !targetUserId) return false;
    if (selectedBetEntry.requiresSubjects && (!subjectA || !subjectB || subjectA === subjectB)) return false;
    if (selectedBetEntry.requiresPrediction && !predicted) return false;
    return true;
  })();

  const handleProposeBet = () => {
    if (!betReady || !selectedBetEntry || !bigBlindCents || proposingBetRef.current) return;
    proposingBetRef.current = true;
    onProposeSideBet({
      catalogKey: selectedBetEntry.id,
      stakeCents: stakeBigBlinds * bigBlindCents,
      subjectUserIds: selectedBetEntry.requiresSubjects && subjectA && subjectB ? [subjectA, subjectB] : undefined,
      predictedSubjectUserId: selectedBetEntry.requiresPrediction ? (predicted ?? undefined) : undefined,
    });
    handleClose();
  };

  const nameFor = (id: string | null) => availableSubjects.find((c) => c.userId === id)?.name ?? "—";

  const BackRow = ({ to }: { to: Step }) => (
    <Pressable onPress={() => setStep(to)} accessibilityRole="button">
      <Text variant="muted">← Back</Text>
    </Pressable>
  );

  return (
    <ModalSheet visible={visible} onClose={handleClose} title={targetName}>
      <View className="ui-stack-4" style={{ flex: 1, minHeight: 0 }}>
        {step === "menu" ? (
          <View className="ui-stack-2">
            <Button title="🎁 Send Gift" intent="primary" onPress={() => setStep("gift")} />
            <Button
              title="🎲 Side Bet"
              intent="secondary"
              onPress={() => setStep("sidebet-list")}
              disabled={!canBet}
            />
          </View>
        ) : step === "gift" ? (
          <View className="ui-stack-3" style={{ flex: 1, minHeight: 0 }}>
            <BackRow to="menu" />
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View className="ui-row-wrap ui-inline-2">
                {GIFT_CATALOG.map((entry: GiftCatalogEntry) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => handleSendGift(entry.id)}
                    className="ui-surface px-3 py-2 items-center"
                    style={{ width: 84 }}
                  >
                    <Text variant="h2">{entry.emoji}</Text>
                    <Text variant="label" numberOfLines={1}>
                      {entry.label}
                    </Text>
                    <Text variant="muted">{formatCents(entry.costCents)}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : step === "sidebet-list" ? (
          <View className="ui-stack-3">
            <BackRow to="menu" />
            <View className="ui-stack-2">
              {SIDE_BET_CATALOG.map((entry: SideBetCatalogEntry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    setSelectedBetKey(entry.id);
                    setStep("sidebet-config");
                  }}
                  className="ui-surface px-3 py-2"
                >
                  <Text variant="label">{entry.label}</Text>
                  <Text variant="muted" numberOfLines={2}>
                    {entry.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : selectedBetEntry ? (
          <View className="ui-stack-3">
            <BackRow to="sidebet-list" />

            {selectedBetEntry.requiresSubjects ? (
              availableSubjects.length < 2 ? (
                <Text variant="muted">Need at least two other seated players for this bet.</Text>
              ) : (
                <>
                  <Text variant="label">Subject A</Text>
                  <View className="ui-row-wrap ui-inline-2">
                    {availableSubjects.map((c) => (
                      <Pressable
                        key={c.userId}
                        onPress={() => setSubjectA(c.userId)}
                        className={`ui-surface px-2 py-1 ${subjectA === c.userId ? "border-accent-purple" : ""}`}
                      >
                        <Text variant="label">{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text variant="label">Subject B</Text>
                  <View className="ui-row-wrap ui-inline-2">
                    {availableSubjects
                      .filter((c) => c.userId !== subjectA)
                      .map((c) => (
                        <Pressable
                          key={c.userId}
                          onPress={() => setSubjectB(c.userId)}
                          className={`ui-surface px-2 py-1 ${subjectB === c.userId ? "border-accent-purple" : ""}`}
                        >
                          <Text variant="label">{c.name}</Text>
                        </Pressable>
                      ))}
                  </View>
                </>
              )
            ) : null}

            {selectedBetEntry.requiresPrediction && subjectA && subjectB ? (
              <>
                <Text variant="label">Your pick</Text>
                <View className="ui-row ui-inline-2">
                  <Pressable
                    onPress={() => setPredicted(subjectA)}
                    className={`ui-surface px-2 py-1 ${predicted === subjectA ? "border-accent-purple" : ""}`}
                  >
                    <Text variant="label">{nameFor(subjectA)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPredicted(subjectB)}
                    className={`ui-surface px-2 py-1 ${predicted === subjectB ? "border-accent-purple" : ""}`}
                  >
                    <Text variant="label">{nameFor(subjectB)}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <Text variant="label">
              Stake: {stakeBigBlinds} BB{bigBlindCents ? ` (${formatCents(stakeBigBlinds * bigBlindCents)})` : ""}
            </Text>
            <Slider
              value={stakeBigBlinds}
              min={selectedBetEntry.minStakeBigBlinds}
              max={selectedBetEntry.maxStakeBigBlinds}
              onValueChange={setStakeBigBlinds}
            />

            <Button title={`Propose to ${targetName}`} intent="primary" onPress={handleProposeBet} disabled={!betReady} />
          </View>
        ) : null}
      </View>
    </ModalSheet>
  );
}
