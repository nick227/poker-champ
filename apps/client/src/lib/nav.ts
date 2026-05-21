import { screenRegistry } from "@/registry/screen.registry";

export function tablePath(
  id: string,
  opts?: { buyInCents?: number },
): string {
  const base = `/table/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  const buyInCents = opts?.buyInCents;
  if (Number.isInteger(buyInCents) && Number(buyInCents) > 0) {
    params.set("buyInCents", String(buyInCents));
  }
  const query = params.toString();
  return query.length > 0 ? `${base}?${query}` : base;
}

export function lobbyPath(): string {
  return screenRegistry.byKey.lobby.path;
}

export function tournamentPath(id: string): string {
  return `/tournaments/${encodeURIComponent(id)}`;
}

function loginPath(): string {
  return screenRegistry.byKey.login.path;
}

export function loginPathWithNext(next: string): string {
  const base = loginPath();
  return `${base}?next=${encodeURIComponent(next)}`;
}
