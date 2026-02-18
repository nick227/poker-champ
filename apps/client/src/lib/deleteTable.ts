import { Alert, Platform } from "react-native";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";

const deleteInProgress = { current: false };

async function performDelete(tableId: string, options: { onSuccess?: () => void }): Promise<void> {
  if (deleteInProgress.current) return;
  deleteInProgress.current = true;
  try {
    const res = await serviceRegistry.post.deleteTable(tableId);
    if (res.ok) {
      options.onSuccess?.();
      useToastStore.getState().show("Table deleted", "success");
    } else {
      useToastStore.getState().show(res.error.message ?? "Failed to delete table", "danger");
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
