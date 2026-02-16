let apiBaseUrl: string | null = null;
let authToken: string | null = null;

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.replace(/\/$/, "");
}
export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}
