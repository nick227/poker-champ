import { getAuthToken, setAuthToken } from "./context";

export const authStore = {
  getToken(): string | null {
    return getAuthToken();
  },
  setToken(nextToken: string | null) {
    setAuthToken(nextToken);
  },
  clear() {
    setAuthToken(null);
  },
};
