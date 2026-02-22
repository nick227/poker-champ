import { screenRegistry } from "@/registry/screen.registry";

export function tablePath(id: string, opts?: { buyInCents?: number }): string {
  const base = `/table/${encodeURIComponent(id)}`;
  const buyInCents = opts?.buyInCents;
  if (Number.isInteger(buyInCents) && Number(buyInCents) > 0) {
    return `${base}?buyInCents=${encodeURIComponent(String(buyInCents))}`;
  }
  return base;
}

export function lobbyPath(): string {
  return screenRegistry.byKey.lobby.path;
}

export function loginPath(): string {
  return screenRegistry.byKey.login.path;
}

export function loginPathWithNext(next: string): string {
  const base = loginPath();
  return `${base}?next=${encodeURIComponent(next)}`;
}

