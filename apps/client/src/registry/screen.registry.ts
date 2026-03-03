import { Ionicons } from '@expo/vector-icons';

export type ScreenKey = "index" | "login" | "lobby" | "table" | "settings" | "history" | "leaderboard" | "slots" | "lessons";

type ScreenDefinition = {
  path: string;
  authRequired: boolean;
  title: string;
  showInBottomBar?: boolean;
  bottomBarLabel?: string;
  componentPath: string;
  icon?: keyof typeof Ionicons.glyphMap;
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
  history: {
    path: "/history",
    authRequired: true,
    title: "Hand History",
    showInBottomBar: false,
    bottomBarLabel: "History",
    componentPath: "app/history.tsx",
  },
  slots: {
    path: "/slots",
    authRequired: false,
    title: "Slots",
    componentPath: "app/slots.tsx",
    showInBottomBar: false,
    bottomBarLabel: "Slots",
  },
  table: {
    path: "/table/[id]",
    authRequired: true,
    title: "Table",
    showInBottomBar: false, // Changed: no longer in bottom bar
    componentPath: "app/table/[id].tsx",
  },
  lobby: {
    path: "/lobby",
    authRequired: true,
    title: "Lobby",
    showInBottomBar: true,
    bottomBarLabel: "Lobby",
    componentPath: "app/lobby.tsx",
    icon: 'home',
  },
  lessons: {
    path: "/lessons",
    authRequired: true,
    title: "Poker School",
    showInBottomBar: true,
    bottomBarLabel: "Learn",
    componentPath: "app/lessons.tsx",
    icon: 'book',
  },
  leaderboard: {
    path: "/leaderboard",
    authRequired: true,
    title: "Leaderboard",
    showInBottomBar: true,
    bottomBarLabel: "Board",
    componentPath: "app/leaderboard.tsx",
    icon: 'bar-chart',
  },
  settings: {
    path: "/settings",
    authRequired: true,
    title: "Settings",
    icon: 'person',
    showInBottomBar: true,
    bottomBarLabel: "You",
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
