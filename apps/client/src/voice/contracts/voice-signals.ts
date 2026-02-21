import { z } from "zod";

/**
 * Portable signaling contract.
 * Keep this free of Colyseus, poker, and app details.
 */

export const VOICE_SIGNAL_TYPE = "VOICE_SIGNAL" as const;

export const VoiceSignalOfferSchema = z.object({
  type: z.literal("VOICE_OFFER"),
  channelId: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  sdp: z.any(), // RTCSessionDescriptionInit (runtime shape differs across envs)
});

export const VoiceSignalAnswerSchema = z.object({
  type: z.literal("VOICE_ANSWER"),
  channelId: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  sdp: z.any(),
});

export const VoiceSignalIceSchema = z.object({
  type: z.literal("VOICE_ICE"),
  channelId: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  candidate: z.any(), // RTCIceCandidateInit
});

export const VoiceSignalMessageSchema = z.discriminatedUnion("type", [
  VoiceSignalOfferSchema,
  VoiceSignalAnswerSchema,
  VoiceSignalIceSchema,
]);

export type VoiceSignalMessage = z.infer<typeof VoiceSignalMessageSchema>;
