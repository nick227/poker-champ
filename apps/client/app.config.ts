import "dotenv/config";

export default {
  expo: {
    name: "Poker Champ",
    slug: "poker-champ",
    scheme: "pokerchamp",
    version: "0.2.0",
    orientation: "portrait",
    platforms: ["ios", "android", "web"],
    userInterfaceStyle: "dark",
    web: { bundler: "metro" },
    plugins: ["expo-router"],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      apiVersion: process.env.EXPO_PUBLIC_API_VERSION,
      wsUrl: process.env.EXPO_PUBLIC_WS_URL,
      colyseusUrl: process.env.EXPO_PUBLIC_COLYSEUS_URL,
      realtimeTransport: process.env.EXPO_PUBLIC_REALTIME_TRANSPORT
    }
  }
};
