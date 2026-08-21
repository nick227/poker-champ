import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Animated, Modal, Pressable, View, FlatList, ActivityIndicator, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/base/Text";
import { storeRegistry } from "@/registry/store.registry";
import { PlayingCard } from "@/features/table/components/table/PlayingCard";
import { historyService, type HandHistoryDetail } from "@/services/history.service";
import { useAuthStore } from "@/stores/auth.store";
import { formatUsd } from "@/lib/money/format-usd";
import type { HandHistoryListItem } from "@/services/history.service";
import { MODAL } from "@/constants/copy";
import { BACKDROP_OVERLAY } from "@/theme/colors";

function MiniCard({ cardStr, dimmed = false }: { cardStr?: string; dimmed?: boolean }) {
  return (
    <View style={{ transform: [{ scale: 0.45 }], marginHorizontal: -19, marginVertical: -25, opacity: dimmed ? 0.5 : 1 }}>
      {cardStr ? (
        <PlayingCard rank={cardStr[0]} suit={cardStr[1]} />
      ) : (
        <PlayingCard faceDown />
      )}
    </View>
  );
}

function BoardCard({ cardStr }: { cardStr: string }) {
  return (
    <View style={{ transform: [{ scale: 0.65 }], marginHorizontal: -10, marginVertical: -20 }}>
      <PlayingCard rank={cardStr[0]} suit={cardStr[1]} />
    </View>
  );
}

function HandRow({ hand, token }: { hand: HandHistoryListItem; token: string }) {
  const [detail, setDetail] = useState<HandHistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    historyService.getHandDetail({ token, handId: hand.id }).then(res => {
      if (!mounted) return;
      if (res.ok) setDetail(res.data);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [hand.id, token]);

  const potSize = useMemo(() => {
    if (detail) {
      // Sum all actions that put money in the pot, or use payouts
      const payoutPot = detail.payouts.reduce((sum, p) => sum + p.amountCents, 0);
      if (payoutPot > 0) return payoutPot;
      
      // Fallback to summing actions if payouts are empty
      return detail.actions.reduce((sum, a) => {
        if (["BET", "RAISE", "CALL", "ALL_IN", "POST"].includes(a.action)) {
          return sum + a.amountCents;
        }
        return sum;
      }, 0);
    }
    return hand.totalPotCents ?? 0;
  }, [detail, hand]);

  if (loading) {
    return (
      <View className="ui-p-4 border-b border-border ui-stack-3 min-h-[120px] justify-center items-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (!detail) {
    return (
      <View className="ui-p-4 border-b border-border">
        <Text variant="muted">Failed to load hand details.</Text>
      </View>
    );
  }

  const actionsByStreet = {
    PF: detail.actions.filter(a => a.street === "PREFLOP"),
    F: detail.actions.filter(a => a.street === "FLOP"),
    T: detail.actions.filter(a => a.street === "TURN"),
    R: detail.actions.filter(a => a.street === "RIVER"),
  };

  const hasActions = (actions: any[]) => actions && actions.length > 0;

  return (
    <View className="ui-p-4 border-b border-border ui-stack-3">
      <View className="ui-stack-1">
        <View className="ui-row justify-between items-center">
          <Text variant="body" className="text-lg font-bold">{hand.tableName}</Text>
          <Text variant="body" className="font-bold text-gold text-base">Pot: {formatUsd(potSize)}</Text>
        </View>
        <Text variant="muted" className="text-xs">{hand.playedAt.toLocaleTimeString()}</Text>
      </View>

      <View className="ui-stack-2 mt-2">
        <Text variant="muted" className="text-xs">Players</Text>
        <View className="ui-row flex-wrap gap-2">
          {detail.players.map(p => {
            const folded = detail.actions.some(a => a.actorUserId === p.userId && a.action === "FOLD");
            return (
              <View key={p.userId} className="ui-stack-1 items-center bg-panel-elevated ui-p-2 rounded flex-1 min-w-[30%]">
                <Text variant="body" className="text-xs font-bold" numberOfLines={1}>{p.displayName}</Text>
                <View className="ui-row min-h-[40px] items-center">
                  {(p.holeCards && p.holeCards.length > 0) ? (
                    p.holeCards.map((c, i) => <MiniCard key={i} cardStr={c} dimmed={folded} />)
                  ) : folded ? (
                    <>
                      <MiniCard dimmed />
                      <MiniCard dimmed />
                    </>
                  ) : (
                    <Text variant="muted" className="text-xs">Mucked</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="ui-stack-1 mt-2">
        <Text variant="muted" className="text-xs">Board</Text>
        <View className="ui-row min-h-[60px] items-center justify-around bg-panel-elevated ui-p-2 rounded px-4">
          {detail.boardCards && detail.boardCards.length > 0 ? (
            detail.boardCards.map((c, i) => <BoardCard key={i} cardStr={c} />)
          ) : (
            <Text variant="muted" className="text-xs">None</Text>
          )}
        </View>
      </View>

      <View className="bg-panel-elevated ui-p-2 rounded mt-2 ui-stack-2">
        {(() => {
          let outcomeText = detail.reason || "";
          
          // Find the last hand result in the snapshots to get the winning hand description
          const lastSnapshotWithResult = detail.snapshots?.slice().reverse().find(s => s.lastHandResult);
          const winningHandDescr = lastSnapshotWithResult?.lastHandResult?.winningHandDescr;
          
          // Format payouts: "Alice won $5.00, Bob won $2.00"
          const winners = detail.payouts.filter(p => p.amountCents > 0);
          const winnersText = winners.length > 0 
            ? winners.map(w => `${w.displayName} won ${formatUsd(w.amountCents)}`).join(" and ")
            : "";
          
          if (winnersText) {
            if (detail.reason === "SHOWDOWN") {
              outcomeText = `${winnersText}${winningHandDescr ? ` with ${winningHandDescr.toLowerCase()}` : " at showdown"}`;
            } else if (detail.reason === "LAST_PLAYER" || detail.reason === "ALL_FOLDED") {
              outcomeText = `${winnersText} after everyone folded`;
            } else {
              outcomeText = `${winnersText} (${detail.reason})`;
            }
          }
          
          return outcomeText ? (
            <Text variant="body" className="text-sm font-bold text-gold mb-1">Outcome: {outcomeText}</Text>
          ) : null;
        })()}
        
        {hasActions(actionsByStreet.PF) && (
          <View className="ui-stack-1">
            <Text variant="muted" className="text-xs font-bold">PF (Preflop)</Text>
            <Text variant="body" className="text-xs leading-relaxed">
              {actionsByStreet.PF.map(a => `${a.actorDisplayName} ${a.action}${a.amountCents > 0 ? ' ' + formatUsd(a.amountCents) : ''}`).join(", ")}
            </Text>
          </View>
        )}
        
        {hasActions(actionsByStreet.F) && (
          <View className="ui-stack-1 mt-1">
            <Text variant="muted" className="text-xs font-bold">F (Flop)</Text>
            <Text variant="body" className="text-xs leading-relaxed">
              {actionsByStreet.F.map(a => `${a.actorDisplayName} ${a.action}${a.amountCents > 0 ? ' ' + formatUsd(a.amountCents) : ''}`).join(", ")}
            </Text>
          </View>
        )}
        
        {hasActions(actionsByStreet.T) && (
          <View className="ui-stack-1 mt-1">
            <Text variant="muted" className="text-xs font-bold">T (Turn)</Text>
            <Text variant="body" className="text-xs leading-relaxed">
              {actionsByStreet.T.map(a => `${a.actorDisplayName} ${a.action}${a.amountCents > 0 ? ' ' + formatUsd(a.amountCents) : ''}`).join(", ")}
            </Text>
          </View>
        )}
        
        {hasActions(actionsByStreet.R) && (
          <View className="ui-stack-1 mt-1">
            <Text variant="muted" className="text-xs font-bold">R (River)</Text>
            <Text variant="body" className="text-xs leading-relaxed">
              {actionsByStreet.R.map(a => `${a.actorDisplayName} ${a.action}${a.amountCents > 0 ? ' ' + formatUsd(a.amountCents) : ''}`).join(", ")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function HandHistorySideRail({ visible, onClose }: { visible: boolean; onClose: () => void; }) {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();
  
  const [isExiting, setIsExiting] = useState(false);
  const slide = useRef(new Animated.Value(450)).current; 
  const backdrop = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (visible && !isExiting) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible, isExiting, backdrop, slide]);
  
  useEffect(() => {
    if (!visible && !isExiting) {
      slide.setValue(450);
      backdrop.setValue(0);
    }
  }, [visible, isExiting, slide, backdrop]);
  
  const handleClose = () => {
    setIsExiting(true);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 450, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setIsExiting(false);
      onClose();
    });
  };
  
  const showOverlay = visible || isExiting;
  
  const loadHands = useCallback(
    async (cursor?: string) => {
      if (!token) return;
      const store = storeRegistry.history();
      try {
        store.setIsLoading(true);
        store.setError(null);
        // Load only most recent 6 hands to allow detailed fetching without overwhelming
        const res = await historyService.getHands({ token, cursor, limit: 6 });
        if (!res.ok) throw new Error(res.error.message);
        cursor ? store.appendHands(res.data.hands) : store.setHands(res.data.hands);
        store.setCursor(res.data.nextCursor);
        store.setHasMore(res.data.nextCursor !== null);
      } catch {
        store.setError("Failed to load hands");
      } finally {
        store.setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (visible && token && !isExiting) {
      loadHands();
    }
  }, [visible, token, loadHands, isExiting]);

  const loadMoreHands = () => {
    const store = storeRegistry.history();
    if (store.cursor && store.hasMore && !store.isLoading) {
      loadHands(store.cursor);
    }
  };

  if (!showOverlay) return null;

  return (
    <Modal visible={showOverlay} transparent animationType="none">
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={handleClose}>
          <Animated.View style={{ flex: 1, backgroundColor: BACKDROP_OVERLAY, opacity: backdrop }} />
        </Pressable>
        <Animated.View 
          style={{ 
            width: 450, 
            maxWidth: '100%', 
            backgroundColor: 'black',
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX: slide }],
            borderLeftWidth: 1,
            borderColor: 'hsl(var(--c-border))',
            shadowColor: '#000',
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <View className="ui-row justify-between ui-border-b ui-p-inline-4 ui-p-stack-3 shrink-0 items-center">
            <Text variant="h2">Hand History</Text>
            <Pressable onPress={handleClose} className="ui-touch">
              <Text variant="muted">{MODAL.close}</Text>
            </Pressable>
          </View>
          
          <FlatList
            data={historyStore.hands}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HandRow hand={item} token={token!} />}
            onEndReached={historyStore.hasMore ? loadMoreHands : undefined}
            onEndReachedThreshold={0.6}
            ListFooterComponent={
              historyStore.isLoading ? (
                <View className="py-6 items-center"><ActivityIndicator /></View>
              ) : !historyStore.hasMore && historyStore.hands.length > 0 ? (
                <View className="py-4 items-center"><Text variant="muted" className="text-xs">End of hand history</Text></View>
              ) : null
            }
            ListEmptyComponent={
              !historyStore.isLoading ? (
                <View className="flex-1 items-center justify-center p-8">
                  <Text variant="muted">No hands found.</Text>
                </View>
              ) : null
            }
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

