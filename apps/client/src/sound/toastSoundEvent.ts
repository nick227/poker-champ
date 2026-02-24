import type { SoundEvent } from "./emitSoundEvent";

export type ToastVariant = "default" | "success" | "danger";

export function getSoundEventForToastVariant(variant: ToastVariant): SoundEvent {
  return variant === "danger" ? "app.error" : "app.toast";
}
