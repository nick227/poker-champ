export type ErrorUxBehavior =
  | { kind: "toast"; message: string }
  | { kind: "redirect"; to: string; message?: string }
  | { kind: "focus"; target: string; message: string }
  | { kind: "silent" };

export type ErrorCode = "INVALID_CREDENTIALS" | "UNAUTHORIZED" | "FORBIDDEN" | "NETWORK_ERROR" | "INVALID_RESPONSE";

type ErrorDefinition = {
  code: ErrorCode;
  ux: ErrorUxBehavior;
};

const errorByKey: Record<ErrorCode, ErrorDefinition> = {
  INVALID_CREDENTIALS: { code: "INVALID_CREDENTIALS", ux: { kind: "focus", target: "email", message: "Invalid email or password." } },
  UNAUTHORIZED: { code: "UNAUTHORIZED", ux: { kind: "redirect", to: "/login", message: "Please sign in." } },
  FORBIDDEN: { code: "FORBIDDEN", ux: { kind: "toast", message: "You do not have access to this action." } },
  NETWORK_ERROR: { code: "NETWORK_ERROR", ux: { kind: "toast", message: "Network error. Check your connection." } },
  INVALID_RESPONSE: { code: "INVALID_RESPONSE", ux: { kind: "toast", message: "Unexpected response format from server." } },
};

const errorOrdered: ErrorDefinition[] = [
  errorByKey.INVALID_CREDENTIALS,
  errorByKey.UNAUTHORIZED,
  errorByKey.FORBIDDEN,
  errorByKey.NETWORK_ERROR,
  errorByKey.INVALID_RESPONSE,
];

const errorRegistry = {
  byKey: errorByKey,
  ordered: errorOrdered,
} as const;

export function resolveErrorUx(code?: string, status?: number): ErrorUxBehavior {
  if (code && code in errorRegistry.byKey) return errorRegistry.byKey[code as ErrorCode].ux;
  if (status === 401) return { kind: "redirect", to: "/login", message: "Session expired. Please sign in." };
  if (status === 403) return { kind: "toast", message: "Action not permitted." };
  if (status && status >= 500) return { kind: "toast", message: "Server error. Please try again." };
  return { kind: "silent" };
}
