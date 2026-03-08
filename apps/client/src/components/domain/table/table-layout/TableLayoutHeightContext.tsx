import { createContext, useContext, type ReactNode } from "react";

export type TableLayoutHeightValue = {
  heroZoneHeight: number;
  boardAreaHeight: number;
  layoutScale: number;
};

const TableLayoutHeightContext = createContext<TableLayoutHeightValue | null>(null);

export function TableLayoutHeightProvider({
  heroZoneHeight,
  boardAreaHeight,
  layoutScale,
  children,
}: TableLayoutHeightValue & { children: ReactNode }) {
  return (
    <TableLayoutHeightContext.Provider value={{ heroZoneHeight, boardAreaHeight, layoutScale }}>
      {children}
    </TableLayoutHeightContext.Provider>
  );
}

export function useTableLayoutHeight(): TableLayoutHeightValue | null {
  return useContext(TableLayoutHeightContext);
}
