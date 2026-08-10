import { createContext, useContext, type ReactNode } from "react";

type ChromeInsets = {
  /** AppChrome already applied top safe-area (status bar). Screen must not pad top again. */
  topConsumed: boolean;
};

const ChromeInsetsContext = createContext<ChromeInsets>({ topConsumed: false });

export function ChromeInsetsProvider({
  topConsumed,
  children,
}: {
  topConsumed: boolean;
  children: ReactNode;
}) {
  return (
    <ChromeInsetsContext.Provider value={{ topConsumed }}>
      {children}
    </ChromeInsetsContext.Provider>
  );
}

export function useChromeInsets(): ChromeInsets {
  return useContext(ChromeInsetsContext);
}
