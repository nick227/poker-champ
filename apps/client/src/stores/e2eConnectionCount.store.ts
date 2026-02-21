/**
 * Debug store for e2e: number of active table realtime connections.
 * Incremented when a table session is created, decremented on disconnect.
 * Used by Playwright to assert no connection leak (lobby → table → lobby → table => count === 1).
 */
import { create } from "zustand";

type State = { tableConnectionCount: number };

export const useE2EConnectionCountStore = create<State & { increment: () => void; decrement: () => void }>((set) => ({
  tableConnectionCount: 0,
  increment: () => set((s) => ({ tableConnectionCount: s.tableConnectionCount + 1 })),
  decrement: () => set((s) => ({ tableConnectionCount: Math.max(0, s.tableConnectionCount - 1) })),
}));
