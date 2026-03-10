import { Alert, Platform } from "react-native";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";
import { useLobbyStore } from "@/features/lobby/stores/lobby.store";

const deleteInProgress = { current: false };

async function performDelete(tableId: string, options: { onSuccess?: () => void }): Promise<void> {
  if (deleteInProgress.current) return;
  deleteInProgress.current = true;
  try {
    // If the table is already absent from the store (e.g. after a backend restart),
    // skip the HTTP call entirely — the room is already gone server-side.
    const knownTables = useLobbyStore.getState().tables as Array<{ tableId?: string; id?: string }>;
    const tableStillInStore = knownTables.some(
      (t) => (t.tableId ?? t.id) === tableId,
    );
    if (!tableStillInStore) {
      options.onSuccess?.();
      return;
    }

    const res = await serviceRegistry.post.deleteTable(tableId);
    if (res.ok) {
      options.onSuccess?.();
      useToastStore.getState().show("Table deleted", "success");
    } else if (res.error?.status === 404) {
      // Fallback: treat 404 as success (room disappeared between the store check and the call).
      options.onSuccess?.();
    } else {
      useToastStore.getState().show(res.error?.message ?? "Failed to delete table", "danger");
    }
  } finally {
    deleteInProgress.current = false;
  }
}

export function confirmDeleteTable(tableId: string, options: { onSuccess?: () => void }): void {
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
    if (window.confirm("Delete table?\n\nThe table will be closed. This cannot be undone.")) {
      void performDelete(tableId, options);
    }
    return;
  }
  Alert.alert("Delete table?", "The table will be closed. This cannot be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => void performDelete(tableId, options) },
  ]);
}


