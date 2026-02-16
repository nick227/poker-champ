import { useAuthStore } from "@/stores/auth.store";
import { useLobbyStore } from "@/stores/lobby.store";
import { useMultiTableStore } from "@/stores/multitable.store";
import { useTableStore } from "@/stores/table.store";

const storeByKey = {
  auth: {
    key: "auth",
    get: () => useAuthStore.getState(),
    use: useAuthStore,
  },
  lobby: {
    key: "lobby",
    get: () => useLobbyStore.getState(),
    use: useLobbyStore,
  },
  tables: {
    key: "tables",
    get: () => useMultiTableStore.getState(),
    use: useMultiTableStore,
  },
  table: {
    key: "table",
    get: () => useTableStore.getState(),
    use: useTableStore,
  },
} as const;

const storeOrdered = [storeByKey.auth, storeByKey.lobby, storeByKey.tables, storeByKey.table] as const;

export const storeRegistry = {
  byKey: storeByKey,
  ordered: storeOrdered,
  auth: () => storeByKey.auth.get(),
  lobby: () => storeByKey.lobby.get(),
  tables: () => storeByKey.tables.get(),
  table: () => storeByKey.table.get(),
  use: {
    auth: storeByKey.auth.use,
    lobby: storeByKey.lobby.use,
    tables: storeByKey.tables.use,
    table: storeByKey.table.use,
  },
} as const;
