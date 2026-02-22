import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { PlayerHistoryPopup } from "@/components/domain/table/PlayerHistoryPopup";
import { ChatOverlay } from "@/components/domain/table/ChatOverlay";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { ThemePickerSheet } from "@/components/domain/table/ThemePickerSheet";
import { MODAL } from "@/constants/copy";
import type { TableScreenController } from "@/types/tableSceneContract";

type TableScreenOverlaysProps = {
  renderModel: TableScreenController["renderModel"];
  uiState: TableScreenController["uiState"];
  actions: TableScreenController["actions"];
};

export function TableScreenOverlays({ renderModel, uiState, actions }: TableScreenOverlaysProps) {
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
    </>
  );
}
