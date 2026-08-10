import { Button } from "./Button";

export function ChipButton({
  title,
  onPress,
  selected,
  disabled,
  selectedAccent = "brand",
  className = "",
}: {
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  selectedAccent?: "brand" | "gold";
  className?: string;
}) {
  // Quiet selection: gold border + gold text, not a solid gold brick.
  const selectedAccentClass =
    selected && selectedAccent === "gold"
      ? "bg-panel-elevated border-gold"
      : selected
        ? "bg-panel-elevated border-brand/50"
        : "";

  const selectedText =
    selected && selectedAccent === "gold"
      ? "text-gold font-semibold"
      : selected
        ? "text-text"
        : "text-muted";

  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      intent="neutral"
      size="sm"
      shape="hud"
      selected={selected}
      className={`min-w-[52px] ${selectedAccentClass} ${className}`.trim()}
      textClassName={selectedText}
    />
  );
}
