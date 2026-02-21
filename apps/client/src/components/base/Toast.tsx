import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Text } from "./Text";

type ToastProps = {
  message: string;
  variant?: "default" | "success" | "danger";
  onDismiss: () => void;
  duration?: number;
};

const variantClass = {
  default: "bg-panel border-border",
  success: "bg-success/20 border-success/50",
  danger: "bg-danger/20 border-danger/50",
};

export function Toast({ message, variant = "default", onDismiss, duration = 3000 }: ToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const id = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(id);
  }, [duration]);

  return (
    <View
      className={`absolute bottom-24 left-4 right-4 rounded-lg border ui-p-4 ${variantClass[variant]}`}
      data-testid="toast"
      data-variant={variant}
    >
      <Text variant="body">{message}</Text>
    </View>
  );
}
