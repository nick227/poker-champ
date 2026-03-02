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
    android: {
      package: "com.pokerchamp.app",
    },
    web: {
      bundler: "metro",
      favicon: "./assets/images/spades.png",
    },
    plugins: ["expo-router"],
    extra: {
      eas: {
        projectId: "864089ba-8445-458d-a792-695cd1667be7",
      },
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      apiVersion: process.env.EXPO_PUBLIC_API_VERSION,
      wsUrl: process.env.EXPO_PUBLIC_WS_URL,
      colyseusUrl: process.env.EXPO_PUBLIC_COLYSEUS_URL,
      realtimeTransport: process.env.EXPO_PUBLIC_REALTIME_TRANSPORT,
      stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      stripeTipLinkId: process.env.EXPO_PUBLIC_STRIPE_TIP_LINK_ID,
    }
  }
};
