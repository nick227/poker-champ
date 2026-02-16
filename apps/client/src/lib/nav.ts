import { screenRegistry } from "@/registry/screen.registry";

export function tablePath(id: string): string {
  return `/table/${encodeURIComponent(id)}`;
}

export function lobbyPath(): string {
  return screenRegistry.byKey.lobby.path;
}

export function loginPath(): string {
  return screenRegistry.byKey.login.path;
}
