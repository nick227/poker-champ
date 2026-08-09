import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { tablePath } from "@/lib/nav";

export function resolveShareTableUrl(tableId: string): string {
  const path = tablePath(tableId);

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }

  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;

  return path;
}

export async function shareTable(tableUrl: string): Promise<void> {
  try {
    await Share.share({
      title: "Poker Champ Table",
      message: `Join my table:`,
      url: tableUrl,
    });
  } catch (err) {
    console.error("Share failed:", err);
  }
}

export function copyShareTableUrl(
  url: string,
  showToast: (msg: string, variant?: "default" | "success" | "danger") => void,
): void {
  Clipboard.setStringAsync(url)
    .then(() => showToast("Share table URL copied to clipboard!", "success"))
    .catch((err) => {
      console.error("Failed to copy share table URL:", err);
    });
}
