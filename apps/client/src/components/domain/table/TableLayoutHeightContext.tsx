import { createContext, useContext, type ReactNode } from "react";

export type TableLayoutHeightValue = {
  heroZoneHeight: number;
};

const TableLayoutHeightContext = createContext<TableLayoutHeightValue | null>(null);

export function TableLayoutHeightProvider({
  heroZoneHeight,
  children,
}: TableLayoutHeightValue & { children: ReactNode }) {
  return (
    <TableLayoutHeightContext.Provider value={{ heroZoneHeight }}>
      {children}
    </TableLayoutHeightContext.Provider>
  );
}

export function useTableLayoutHeight(): TableLayoutHeightValue | null {
  return useContext(TableLayoutHeightContext);
}
