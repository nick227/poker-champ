import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

export const LOBBY_ROW_CTA_CLASS = "h-8 min-h-[32px] w-[92px] px-2.5";

export type LobbyRowCtaKind = "join" | "register" | "watch" | "resume" | "quiet";

type Props = {
  title: string;
  kind: LobbyRowCtaKind;
  disabled?: boolean;
  onPress: () => void;
};

export function LobbyRowCta({ title, kind, disabled, onPress }: Props) {
  if (kind === "quiet") {
    return (
      <Text variant="muted" className="text-[11px] text-right" numberOfLines={1}>
        {title}
      </Text>
    );
  }

  const primary = kind === "join" || kind === "resume" || kind === "register";
  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      intent={primary ? "accent" : "neutral"}
      size="sm"
      shape="hud"
      minWidth={0}
      className={
        primary
          ? `${LOBBY_ROW_CTA_CLASS} bg-brand`
          : kind === "watch"
            ? `${LOBBY_ROW_CTA_CLASS} border border-border bg-transparent`
            : LOBBY_ROW_CTA_CLASS
      }
      textClassName={primary ? "text-white font-semibold" : kind === "watch" ? "text-muted" : ""}
    />
  );
}
