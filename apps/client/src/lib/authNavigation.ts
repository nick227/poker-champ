import { loginPathWithNext } from "@/lib/nav";

export type AuthSessionState = {
  hydrated: boolean;
  token: string | null;
};

export function getSettingsTargetPath(state: AuthSessionState): string {
  return state.hydrated && state.token ? "/settings" : loginPathWithNext("/settings");
}

export function getProtectedRouteRedirect(state: AuthSessionState, nextPath: string): string | null {
  if (!state.hydrated) return null;
  if (state.token) return null;
  return loginPathWithNext(nextPath);
}
