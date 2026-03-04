import { Button } from "./Button";

export function ConfirmButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      intent="primary"
      size="lg"
    />
  );
}
