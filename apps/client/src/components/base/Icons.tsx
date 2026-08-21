import { Text } from "./Text";

const ICONS = {
  menu: "≡",
  settings: "⚙",
  chat: "💬",
  fold: "✕",
  call: "→",
  raise: "↑",
  send: "➤",
  back: "←",
  close: "×",
  bell: "🔔",
  user: "👤",
  lock: "🔒",
  theme: "🎨",
  logo: "♠",
  share: "🔗",
  info: "ⓘ",
  robot: "🤖",
  history: "📜",
} as const;

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <Text variant="body" className={className} style={{ fontSize: size }}>
      {ICONS[name]}
    </Text>
  );
}
