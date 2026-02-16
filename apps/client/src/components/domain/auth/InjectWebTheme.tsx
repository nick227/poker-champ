import { useEffect } from "react";
import { Platform } from "react-native";
import { TOKENS_CSS } from "@/theme/tokens.web";

const STYLE_ID = "poker-champ-web-theme";

export function InjectWebTheme() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      el.setAttribute("type", "text/css");
      el.textContent = TOKENS_CSS;
      document.head.appendChild(el);
    }
  }, []);
  return null;
}
