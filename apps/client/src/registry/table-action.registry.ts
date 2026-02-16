export type TableActionKey = "fold" | "check" | "call" | "bet" | "raise" | "allIn";

export type TableActionContext = {
  tableId: string;
  amountCents?: number;
};

export type TableActionExecutor = (payload: {
  type: "ACTION";
  action: TableActionKey;
  tableId: string;
  amountCents?: number;
}) => void | Promise<void>;

type TableActionDefinition = {
  key: TableActionKey;
  label: string;
  hotkey: string;
  requiresAmount?: boolean;
};

const tableActionByKey: Record<TableActionKey, TableActionDefinition> = {
  fold: { key: "fold", label: "Fold", hotkey: "F" },
  check: { key: "check", label: "Check", hotkey: "K" },
  call: { key: "call", label: "Call", hotkey: "C" },
  bet: { key: "bet", label: "Bet", hotkey: "B", requiresAmount: true },
  raise: { key: "raise", label: "Raise", hotkey: "R", requiresAmount: true },
  allIn: { key: "allIn", label: "All-in", hotkey: "A" },
};

const tableActionOrdered: TableActionDefinition[] = [
  tableActionByKey.fold,
  tableActionByKey.check,
  tableActionByKey.call,
  tableActionByKey.bet,
  tableActionByKey.raise,
  tableActionByKey.allIn,
];

export const tableActionRegistry = {
  byKey: tableActionByKey,
  ordered: tableActionOrdered,
} as const;

export async function executeTableAction(action: TableActionKey, context: TableActionContext, send: TableActionExecutor) {
  await send({
    type: "ACTION",
    action,
    tableId: context.tableId,
    amountCents: context.amountCents,
  });
}
