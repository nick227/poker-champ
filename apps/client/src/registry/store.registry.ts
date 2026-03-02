import { useAuthStore } from "@/stores/auth.store";
import { useLobbyStore } from "@/stores/lobby.store";
import { useMultiTableStore } from "@/stores/multitable.store";
import { useTableStore } from "@/stores/table.store";
import { useHistoryStore } from "@/stores/history.store";
import { useProfileStore } from "@/stores/profile.store";

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
  history: {
    key: "history",
    get: () => useHistoryStore.getState(),
    use: useHistoryStore,
  },
  profile: {
    key: "profile",
    get: () => useProfileStore.getState(),
    use: useProfileStore,
  },
} as const;

const storeOrdered = [storeByKey.auth, storeByKey.lobby, storeByKey.tables, storeByKey.table, storeByKey.history, storeByKey.profile] as const;

export const storeRegistry = {
  byKey: storeByKey,
  ordered: storeOrdered,
  auth: () => storeByKey.auth.get(),
  lobby: () => storeByKey.lobby.get(),
  tables: () => storeByKey.tables.get(),
  table: () => storeByKey.table.get(),
  history: () => storeByKey.history.get(),
  profile: () => storeByKey.profile.get(),
  use: {
    auth: storeByKey.auth.use,
    lobby: storeByKey.lobby.use,
    tables: storeByKey.tables.use,
    table: storeByKey.table.use,
    history: storeByKey.history.use,
    profile: storeByKey.profile.use,
  },
} as const;
