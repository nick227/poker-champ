import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";

type VoiceControllerLike = {
  isEnabled: () => boolean;
  setMuted: (muted: boolean) => void;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleEnabled: () => Promise<boolean>;
  toggleMute: () => boolean;
};

type UseVoiceJoinPolicyOptions = {
  controllerRef: MutableRefObject<VoiceControllerLike | null>;
  autoJoinAttemptedRef: MutableRefObject<boolean>;
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
  voiceMuted: boolean;
  setVoiceMuted: (muted: boolean) => void;
  voicePrefReady: boolean;
  heroIsSittingOut: boolean;
  voiceRoom: TableRealtimeRoom | null;
  heroUserId: string | null | undefined;
  showVoiceError: (err: unknown) => void;
};

export function useVoiceJoinPolicy({
  controllerRef,
  autoJoinAttemptedRef,
  voiceEnabled,
  setVoiceEnabled,
  voiceMuted,
  setVoiceMuted,
  voicePrefReady,
  heroIsSittingOut,
  voiceRoom,
  heroUserId,
  showVoiceError,
}: UseVoiceJoinPolicyOptions) {
  useEffect(() => {
    const controller = controllerRef.current;
    if (!voiceEnabled || !voicePrefReady) {
      autoJoinAttemptedRef.current = false;
      return;
    }
    if (heroIsSittingOut) return;
    if (!controller) return;
    if (controller.isEnabled()) {
      controller.setMuted(voiceMuted);
      return;
    }
    if (autoJoinAttemptedRef.current) return;

    autoJoinAttemptedRef.current = true;
    void controller
      .join()
      .then(() => {
        controller.setMuted(voiceMuted);
      })
      .catch((err) => {
        console.log("VOICE_AUTOJOIN_ERROR", err);
        setVoiceEnabled(false);
        showVoiceError(err);
      });
  }, [
    voiceEnabled,
    voiceMuted,
    voicePrefReady,
    voiceRoom,
    heroUserId,
    heroIsSittingOut,
    showVoiceError,
    controllerRef,
    autoJoinAttemptedRef,
    setVoiceEnabled,
  ]);

  useEffect(() => {
    if (!heroIsSittingOut) return;
    const controller = controllerRef.current;
    if (!controller || !controller.isEnabled()) return;
    void controller.leave().finally(() => {
      setVoiceEnabled(false);
      setVoiceMuted(false);
      autoJoinAttemptedRef.current = false;
    });
  }, [heroIsSittingOut, controllerRef, autoJoinAttemptedRef, setVoiceEnabled, setVoiceMuted]);

  const handleToggleVoice = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller
      .toggleEnabled()
      .then((enabled) => {
        setVoiceEnabled(enabled);
        if (enabled) {
          controller.setMuted(voiceMuted);
        } else {
          autoJoinAttemptedRef.current = false;
        }
      })
      .catch((err) => {
        console.log("VOICE_TOGGLE_ERROR", err);
        showVoiceError(err);
      });
  }, [voiceMuted, showVoiceError, controllerRef, autoJoinAttemptedRef, setVoiceEnabled]);

  const handleToggleMute = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || !voiceEnabled) return;
    const muted = controller.toggleMute();
    setVoiceMuted(muted);
  }, [voiceEnabled, controllerRef, setVoiceMuted]);

  return {
    handleToggleVoice,
    handleToggleMute,
  };
}
