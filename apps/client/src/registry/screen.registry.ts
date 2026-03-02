export type ScreenKey = "index" | "login" | "lobby" | "table" | "settings" | "history" | "leaderboard" | "slots" | "lessons";

type ScreenDefinition = {
  path: string;
  authRequired: boolean;
  title: string;
  showInBottomBar?: boolean;
  bottomBarLabel?: string;
  componentPath: string;
};

const isLeaderboardTabEnabled = process.env.EXPO_PUBLIC_ENABLE_LEADERBOARD !== "false";

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
    showInBottomBar: false, // Changed: no longer in bottom bar
    componentPath: "app/table/[id].tsx",
  },
  history: {
    path: "/history",
    authRequired: true,
    title: "Hand History",
    showInBottomBar: false,
    bottomBarLabel: "History",
    componentPath: "app/history.tsx",
  },
  lessons: {
    path: "/lessons",
    authRequired: true,
    title: "Poker School",
    showInBottomBar: true,
    bottomBarLabel: "Lessons",
    componentPath: "app/lessons.tsx",
  },
  leaderboard: {
    path: "/leaderboard",
    authRequired: true,
    title: "Leaderboard",
    showInBottomBar: isLeaderboardTabEnabled,
    bottomBarLabel: "Leaderboard",
    componentPath: "app/leaderboard.tsx",
  },
  slots: {
    path: "/slots",
    authRequired: false,
    title: "Slots",
    componentPath: "app/slots.tsx",
    showInBottomBar: false,
    bottomBarLabel: "Slots",
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
