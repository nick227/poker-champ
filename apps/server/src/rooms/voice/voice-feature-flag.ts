/**
 * should -> allow voice relay
 * Server-side kill switch. Default OFF for safety.
 */
export function shouldAllowVoiceRelay(): boolean {
  return process.env.VOICE_ENABLED === "1";
}
