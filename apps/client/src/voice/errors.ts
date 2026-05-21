import { useToastStore } from "@/stores/toast.store";

function isMicrophonePermissionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (message.includes("MIC_PERMISSION_DENIED")) return true;
  if (message.includes("NotAllowedError")) return true;
  return /notallowederror|permission denied|permission/i.test(message.toLowerCase());
}

export function showVoiceErrorToast(err: unknown): void {
  if (isMicrophonePermissionError(err)) {
    useToastStore.getState().show("Microphone permission denied", "danger");
    return;
  }
  useToastStore.getState().show("Voice unavailable. Check microphone permissions.", "danger");
}
