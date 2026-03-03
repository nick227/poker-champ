import type { ReactNode } from "react";
import { Surface } from "@/components/containers/Surface";

export function HeaderStack({ children }: { children: ReactNode }) {
  return <Surface styleId="surface.header.stack">{children}</Surface>;
}

