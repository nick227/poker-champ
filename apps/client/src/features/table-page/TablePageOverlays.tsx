import { ChooseTableModal, TournamentStandingsModal } from "@/features/lobby";
import { PlayerHistoryPopup } from "@/features/table";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { HandHistorySideRail } from "@/components/domain/history/HandHistorySideRail";
import { GiftToast } from "@/components/domain/interactions/GiftToast";
import { SideBetOfferBanner } from "@/components/domain/interactions/SideBetOfferBanner";
import { SideBetResolvedToast } from "@/components/domain/interactions/SideBetResolvedToast";
import { SideBetStatusToast } from "@/components/domain/interactions/SideBetStatusToast";
import { ActiveSideBetsStrip } from "@/components/domain/interactions/ActiveSideBetsStrip";
import { SeatInteractionSheet } from "@/components/domain/interactions/SeatInteractionSheet";
import { ActiveTablesDropdown } from "@/features/table";
import { BotPickerSheet } from "@/features/table";
import { ThemePickerSheet } from "@/features/table";
import { TableAnimationOverlay } from "@/features/table/animations/TableAnimationOverlay";
import { ChipTravelOverlay } from "@/features/table/animations/ChipTravelOverlay";
import { GiftTravelOverlay } from "@/features/table/animations/GiftTravelOverlay";
import { MODAL } from "@/constants/copy";
import type { TablePageController } from "@/types/tableSceneContract";

type TablePageOverlaysProps = {
  renderModel: TablePageController["renderModel"];
  uiState: TablePageController["uiState"];
  actions: TablePageController["actions"];
};

export function TablePageOverlays({ renderModel, uiState, actions }: TablePageOverlaysProps) {
  const { snapshot, animationRequest, chatVisible, chatMessages } = renderModel;
  const { clearAnimationRequest, closeChat, sendChat } = actions;
  const tournament = snapshot?.table?.tournament;

  return (
    <>
      <TableAnimationOverlay
        request={animationRequest}
        onComplete={clearAnimationRequest}
        anchorBounds={renderModel.anchorBounds}
      />
      <ChipTravelOverlay
        requests={renderModel.chipTravelRequests}
        onRequestComplete={actions.completeChipTravel}
      />
      <GiftTravelOverlay
        requests={renderModel.giftTravelRequests}
        onRequestComplete={actions.completeGiftTravel}
      />
      <ChatOverlay visible={chatVisible} onClose={closeChat} messages={chatMessages} onSend={sendChat} />
      <GiftToast gifts={renderModel.giftFeed} />
      <SideBetResolvedToast sideBets={renderModel.sideBets} heroUserId={renderModel.heroUserId} />
      <SideBetStatusToast sideBets={renderModel.sideBets} heroUserId={renderModel.heroUserId} />
      <SideBetOfferBanner
        sideBets={renderModel.sideBets}
        heroUserId={renderModel.heroUserId}
        onRespond={(interactionId, accept) => actions.respondSideBet({ interactionId, accept })}
      />
      <ActiveSideBetsStrip sideBets={renderModel.sideBets} heroUserId={renderModel.heroUserId} onCancel={actions.cancelSideBet} />
      {uiState.playerPopup && (
        <PlayerHistoryPopup visible onClose={actions.closePlayerPopup} name={uiState.playerPopup.name} />
      )}
      {uiState.seatInteraction && (
        <SeatInteractionSheet
          visible
          onClose={actions.closeSeatInteraction}
          targetUserId={uiState.seatInteraction.userId}
          targetName={uiState.seatInteraction.name}
          bigBlindCents={renderModel.bigBlindCents}
          availableSubjects={renderModel.opponents
            // Bots are excluded here deliberately, not by oversight: PokerPlayer.userId
            // persists as "" for every bot (HandHistoryService.ts), so
            // SideBetConditionEvaluator.findPlayer can never match a bot subject against
            // persisted hand data — a bot-subject bet would always resolve VOID. That's an
            // existing gap in already-verified predicate/resolution logic, out of scope to
            // fix here; offering bots as a subject choice that can never actually resolve
            // would be worse than not offering it.
            .filter((o) => !o.isBot && o.id !== renderModel.heroUserId && o.id !== uiState.seatInteraction!.userId)
            .map((o) => ({ userId: o.id, name: o.name }))}
          onSendGift={(catalogKey) =>
            actions.sendGift({ recipientUserId: uiState.seatInteraction!.userId, catalogKey })
          }
          onProposeSideBet={(input) =>
            actions.proposeSideBet({ recipientUserId: uiState.seatInteraction!.userId, ...input })
          }
        />
      )}
      {uiState.rebuySheetVisible &&
      snapshot?.table?.minBuyInCents != null &&
      snapshot?.table?.maxBuyInCents != null ? (
        <ChooseTableModal
          visible
          onClose={actions.closeRebuySheet}
          title={MODAL.rebuy}
          balanceCents={renderModel.balanceCents}
          minBuyInCents={snapshot.table.minBuyInCents}
          maxBuyInCents={Math.min(snapshot.table.maxBuyInCents, renderModel.balanceCents)}
          onApply={(opts) => actions.applyRebuy(opts.buyInCents)}
        />
      ) : null}
      <ActiveTablesDropdown
        visible={uiState.activeTablesDropdownVisible}
        onClose={actions.closeActiveTablesDropdown}
        tables={renderModel.activeTableRows}
        onSelectTable={actions.selectTableFromDropdown}
      />
      <ThemePickerSheet visible={uiState.themePickerVisible} onClose={actions.closeThemePicker} />
      <HandHistorySideRail visible={uiState.handHistoryVisible} onClose={actions.closeHandHistory} />
      <BotPickerSheet
        visible={uiState.botPickerVisible}
        loading={uiState.botPickerLoading}
        bots={renderModel.botSummaries}
        onClose={actions.closeBotPicker}
        onPick={actions.pickBot}
      />
      <TournamentStandingsModal
        visible={renderModel.tournamentStandingsVisible}
        tournamentId={tournament?.tournamentId ?? null}
        onClose={actions.closeTournamentStandings}
      />
    </>
  );
}


