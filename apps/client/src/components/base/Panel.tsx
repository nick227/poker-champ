import type { ReactNode } from "react";
import { Surface } from "@/components/containers/Surface";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface styleId="surface.card.primary" className={className}>
      {children}
    </Surface>
  );
}
