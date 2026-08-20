import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { GIFT_CATALOG, SIDE_BET_CATALOG, type GiftCatalogEntry, type SideBetCatalogEntry } from "@poker-champ/realtime-contract";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { Slider } from "@/components/base/Slider";
import { formatCents } from "@/lib/format";

type PlayerHistoryPopupTab = "stats" | "gift" | "bet";

export type SubjectCandidate = { userId: string; name: string };

type PlayerHistoryPopupProps = {
  visible: boolean;
  onClose: () => void;
  name: string;
  userId?: string;
  vpip?: number;
  pfr?: number;
  hands?: number;
  joinDate?: string;
  location?: string;
  onSendGift?: (catalogKey: string) => void;
  bigBlindCents?: number;
  /** Other seated players eligible as bet subjects — never the hero or this popup's target
   *  (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §9/§10: no own-hand bets). */
  availableSubjects?: SubjectCandidate[];
  onProposeSideBet?: (input: {
    catalogKey: string;
    stakeCents: number;
    subjectUserIds?: [string, string];
    predictedSubjectUserId?: string;
  }) => void;
};

export function PlayerHistoryPopup({
  visible,
  onClose,
  name,
  userId,
  vpip = 0,
  pfr = 0,
  hands = 0,
  joinDate,
  location,
  onSendGift,
  bigBlindCents,
  availableSubjects = [],
  onProposeSideBet,
}: PlayerHistoryPopupProps) {
  const [tab, setTab] = useState<PlayerHistoryPopupTab>("stats");
  const [selectedGiftKey, setSelectedGiftKey] = useState<string | null>(null);
  const [sendingGift, setSendingGift] = useState(false);
  const sendingGiftRef = useRef(false);
  const canGift = Boolean(userId && onSendGift);

  const [selectedBetKey, setSelectedBetKey] = useState<string | null>(null);
  const [subjectA, setSubjectA] = useState<string | null>(null);
  const [subjectB, setSubjectB] = useState<string | null>(null);
  const [predicted, setPredicted] = useState<string | null>(null);
  const [stakeBigBlinds, setStakeBigBlinds] = useState(1);
  const [proposingBet, setProposingBet] = useState(false);
  const proposingBetRef = useRef(false);
  const canBet = Boolean(userId && onProposeSideBet && bigBlindCents);
  const selectedBetEntry = SIDE_BET_CATALOG.find((b) => b.id === selectedBetKey) ?? null;

  useEffect(() => {
    if (!selectedBetEntry) return;
    setStakeBigBlinds(selectedBetEntry.minStakeBigBlinds);
    setSubjectA(null);
    setSubjectB(null);
    setPredicted(null);
  }, [selectedBetEntry]);

  const handleClose = () => {
    setTab("stats");
    setSelectedGiftKey(null);
    setSendingGift(false);
    sendingGiftRef.current = false;
    setSelectedBetKey(null);
    setSubjectA(null);
    setSubjectB(null);
    setPredicted(null);
    setProposingBet(false);
    proposingBetRef.current = false;
    onClose();
  };

  const handleConfirmGift = () => {
    // Guard against a rapid double-tap dispatching two separate SEND_GIFT messages (each
    // charged independently — see docs/GIFTS_AND_SIDE_BETS_DESIGN.md checkpoint testing).
    // A ref is used, not just state, because two click events can fire synchronously back
    // to back before a state update re-renders the disabled button.
    if (!selectedGiftKey || !onSendGift || sendingGiftRef.current) return;
    sendingGiftRef.current = true;
    setSendingGift(true);
    onSendGift(selectedGiftKey);
    setSelectedGiftKey(null);
    setTimeout(() => {
      sendingGiftRef.current = false;
      setSendingGift(false);
    }, 1500);
  };

  const betReady = (() => {
    if (!selectedBetEntry || !userId) return false;
    if (selectedBetEntry.requiresSubjects && (!subjectA || !subjectB || subjectA === subjectB)) return false;
    if (selectedBetEntry.requiresPrediction && !predicted) return false;
    return true;
  })();

  const handleProposeBet = () => {
    if (!betReady || !selectedBetEntry || !onProposeSideBet || !bigBlindCents || proposingBetRef.current) return;
    proposingBetRef.current = true;
    setProposingBet(true);
    onProposeSideBet({
      catalogKey: selectedBetEntry.id,
      stakeCents: stakeBigBlinds * bigBlindCents,
      subjectUserIds: selectedBetEntry.requiresSubjects && subjectA && subjectB ? [subjectA, subjectB] : undefined,
      predictedSubjectUserId: selectedBetEntry.requiresPrediction ? (predicted ?? undefined) : undefined,
    });
    setSelectedBetKey(null);
    setTimeout(() => {
      proposingBetRef.current = false;
      setProposingBet(false);
    }, 1500);
  };

  const nameFor = (id: string | null) => availableSubjects.find((c) => c.userId === id)?.name ?? "—";

  return (
    <ModalSheet visible={visible} onClose={handleClose} title={name}>
      <View className="ui-stack-4">
        {(canGift || canBet) && (
          <View className="ui-row ui-inline-2">
            <Button title="Stats" intent="secondary" size="sm" selected={tab === "stats"} onPress={() => setTab("stats")} />
            {canGift && (
              <Button title="🎁 Gift" intent="secondary" size="sm" selected={tab === "gift"} onPress={() => setTab("gift")} />
            )}
            {canBet && (
              <Button title="🎲 Bet" intent="secondary" size="sm" selected={tab === "bet"} onPress={() => setTab("bet")} />
            )}
          </View>
        )}

        {tab === "stats" ? (
          <View className="ui-stack-4">
            <View className="items-center">
              <View className="h-20 w-20 ui-center rounded-full ui-surface">
                <Text variant="h1">{name.slice(0, 1).toUpperCase()}</Text>
              </View>
            </View>
            <View className="ui-row-wrap ui-inline-2">
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Avg VPIP</Text>
                <Text variant="body">{vpip}%</Text>
              </View>
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Avg PFR</Text>
                <Text variant="body">{pfr}%</Text>
              </View>
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Hands</Text>
                <Text variant="body">{hands}</Text>
              </View>
            </View>
            {joinDate ? (
              <View>
                <Text variant="label">Join date</Text>
                <Text variant="body">{joinDate}</Text>
              </View>
            ) : null}
            {location ? (
              <View>
                <Text variant="label">Location</Text>
                <Text variant="body">{location}</Text>
              </View>
            ) : null}
          </View>
        ) : tab === "gift" ? (
          <View className="ui-stack-4">
            <View className="ui-row-wrap ui-inline-2">
              {GIFT_CATALOG.map((entry: GiftCatalogEntry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => setSelectedGiftKey(entry.id)}
                  className={`ui-surface px-3 py-2 items-center ${selectedGiftKey === entry.id ? "border-accent-purple" : ""}`}
                  style={{ minWidth: 84 }}
                >
                  <Text variant="h2">{entry.emoji}</Text>
                  <Text variant="label" numberOfLines={1}>
                    {entry.label}
                  </Text>
                  <Text variant="muted">{formatCents(entry.costCents)}</Text>
                </Pressable>
              ))}
            </View>
            {selectedGiftKey ? (
              <Button
                title={sendingGift ? "Sending…" : `Send ${GIFT_CATALOG.find((g) => g.id === selectedGiftKey)?.label ?? "Gift"}`}
                intent="primary"
                onPress={handleConfirmGift}
                disabled={sendingGift}
              />
            ) : (
              <Text variant="muted">Pick a gift to send.</Text>
            )}
          </View>
        ) : (
          <View className="ui-stack-4">
            <View className="ui-stack-2">
              {SIDE_BET_CATALOG.map((entry: SideBetCatalogEntry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => setSelectedBetKey(entry.id)}
                  className={`ui-surface px-3 py-2 ${selectedBetKey === entry.id ? "border-accent-purple" : ""}`}
                >
                  <Text variant="label">{entry.label}</Text>
                  <Text variant="muted" numberOfLines={2}>
                    {entry.description}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedBetEntry ? (
              <View className="ui-stack-3">
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

                <Button
                  title={proposingBet ? "Sending…" : `Propose to ${name}`}
                  intent="primary"
                  onPress={handleProposeBet}
                  disabled={!betReady || proposingBet}
                />
              </View>
            ) : (
              <Text variant="muted">Pick a bet to propose.</Text>
            )}
          </View>
        )}
      </View>
    </ModalSheet>
  );
}
