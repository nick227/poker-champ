/**
 * Channel IDs for voice signaling. Table rooms use tableId; lobby uses this constant.
 * Server must enforce: lobby room only accepts channelId === LOBBY_VOICE_CHANNEL_ID.
 */
export const LOBBY_VOICE_CHANNEL_ID = "lobby";
export const LOBBY_VOICE_CAP = 8;
