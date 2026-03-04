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
  const selectedAccentClass =
    selected && selectedAccent === "gold"
      ? "bg-gold border-gold/60"
      : "";

  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      intent="neutral"
      size="sm"
      selected={selected}
      className={`min-w-[52px] ${selectedAccentClass} ${className}`.trim()}
      textClassName={selected ? "text-text" : "text-muted"}
    />
  );
}
