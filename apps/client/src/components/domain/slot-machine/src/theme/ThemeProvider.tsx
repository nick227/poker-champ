import React, { createContext, useContext, useMemo, useState } from "react";
import type { Theme } from "./types";
import { THEMES } from "./themes";

type ThemeCtx = { theme: Theme; themes: Theme[]; setThemeId: (id: string) => void };
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children, initialThemeId }: { children: React.ReactNode; initialThemeId?: string }) {
  const initial = THEMES.find((t) => t.id === initialThemeId) ?? THEMES[0];
  const [themeId, setThemeId] = useState(initial.id);

  const value = useMemo(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    return { theme, themes: THEMES, setThemeId };
  }, [themeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
