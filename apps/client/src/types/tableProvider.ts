import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";
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

/**
 * TypeScript helper to enforce frozen TableProvider contract.
 * 
 * If someone adds extra fields or misses required ones,
 * the compiler will catch it immediately.
 */
function assertTableProvider(p: TableProvider): TableProvider {
  return p;
}

export { assertTableProvider };
