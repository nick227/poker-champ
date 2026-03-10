import { ChooseTableModal } from "@/features/lobby";
import { PlayerHistoryPopup } from "@/features/table";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { ActiveTablesDropdown } from "@/features/table";
import { BotPickerSheet } from "@/features/table";
import { ThemePickerSheet } from "@/features/table";
import { MODAL } from "@/constants/copy";
import type { TablePageController } from "@/types/tableSceneContract";

type TablePageOverlaysProps = {
  renderModel: TablePageController["renderModel"];
  uiState: TablePageController["uiState"];
  actions: TablePageController["actions"];
};

export function TablePageOverlays({ renderModel, uiState, actions }: TablePageOverlaysProps) {
  const snapshot = renderModel.snapshot;

  return (
    <>
      <ChatOverlay
        visible={renderModel.chatVisible}
        onClose={actions.closeChat}
        messages={renderModel.chatMessages}
        onSend={actions.sendChat}
      />
      {uiState.playerPopup && (
        <PlayerHistoryPopup visible onClose={actions.closePlayerPopup} name={uiState.playerPopup.name} />
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
      <BotPickerSheet
        visible={uiState.botPickerVisible}
        loading={uiState.botPickerLoading}
        bots={renderModel.botSummaries}
        onClose={actions.closeBotPicker}
        onPick={actions.pickBot}
      />
    </>
  );
}


