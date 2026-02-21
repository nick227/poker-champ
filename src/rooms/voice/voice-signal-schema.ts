import { VoiceSignalMessageSchema, type VoiceSignalMessage } from "../../voice/contracts/voice-signals";
import { logger } from "../../lib/logger";

const strict = process.env.VOICE_STRICT === "1";

/**
 * parse -> voice signal message
 * In prod: returns null on invalid (drop)
 * In strict: throws (fail fast in dev/test)
 */
export function parseVoiceSignalMessage(raw: unknown): VoiceSignalMessage | null {
  const parsed = VoiceSignalMessageSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (strict) {
    throw new Error(`VOICE_SIGNAL invalid: ${parsed.error.message}`);
  }

  logger.warn({ err: parsed.error }, "VOICE_SIGNAL dropped (invalid)");
  return null;
}
