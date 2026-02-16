export type ScreenKey = "index" | "login" | "lobby" | "table" | "settings";

type ScreenDefinition = {
  path: string;
  authRequired: boolean;
  title: string;
  showInBottomBar?: boolean;
  bottomBarLabel?: string;
  componentPath: string;
};

const screenByKey: Record<ScreenKey, ScreenDefinition> = {
  index: {
    path: "/",
    authRequired: false,
    title: "Index",
    componentPath: "app/index.tsx",
  },
  login: {
    path: "/login",
    authRequired: false,
    title: "Login",
    componentPath: "app/login.tsx",
  },
  lobby: {
    path: "/lobby",
    authRequired: true,
    title: "Lobby",
    showInBottomBar: true,
    bottomBarLabel: "Lobby",
    componentPath: "app/lobby.tsx",
  },
  table: {
    path: "/table/[id]",
    authRequired: true,
    title: "Table",
    showInBottomBar: true,
    bottomBarLabel: "Tables",
    componentPath: "app/table/[id].tsx",
  },
  settings: {
    path: "/settings",
    authRequired: true,
    title: "Settings",
    showInBottomBar: true,
    bottomBarLabel: "Settings",
    componentPath: "app/settings.tsx",
  },
};

const screenOrdered = (Object.keys(screenByKey) as ScreenKey[]).map((key) => ({
  key,
  ...screenByKey[key],
}));

const bottomBar = screenOrdered.filter((screen) => screen.showInBottomBar);

export const screenRegistry = {
  byKey: screenByKey,
  ordered: screenOrdered,
  bottomBar,
} as const;

export const bottomBarScreens = screenRegistry.bottomBar;

export function getDefaultRoute(isAuthed: boolean): string {
  return isAuthed ? screenRegistry.byKey.lobby.path : screenRegistry.byKey.login.path;
}
