import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

export const LOBBY_ROW_CTA_CLASS = "h-7 min-h-[28px] px-2.5";

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

  const join = kind === "join" || kind === "resume";
  const register = kind === "register";
  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      intent={register ? "accent" : join ? "ghost" : "neutral"}
      size="sm"
      shape="hud"
      minWidth={0}
      className={
        join
          ? `${LOBBY_ROW_CTA_CLASS} border border-brand bg-transparent`
          : kind === "watch"
            ? `${LOBBY_ROW_CTA_CLASS} border border-border bg-transparent`
            : LOBBY_ROW_CTA_CLASS
      }
      textClassName={join ? "text-brand" : kind === "watch" ? "text-muted" : ""}
    />
  );
}
