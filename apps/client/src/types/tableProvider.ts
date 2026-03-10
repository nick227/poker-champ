import type { ActionBarOnAction } from "@/features/table";
import type { TableSceneContract } from "@/types/tableSceneContract";

/**
 * Frozen provider contract for all table modes (GAME, LESSON, REPLAY, etc.)
 * 
 * Both GAME and LESSON providers must expose this exact shape.
 * Providers may expose additional fields (e.g. evaluation), but ActiveTableView
 * only consumes the frozen contract.
 */
export type TableProvider = TableSceneContract & {
  onAction: ActionBarOnAction;
};




