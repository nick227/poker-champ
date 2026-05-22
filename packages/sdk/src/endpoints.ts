import { request } from "./client";
import type { components, paths } from "./types.gen";

type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

type JsonRequestBody<TOperation> = TOperation extends {
  requestBody: { content: { "application/json": infer TBody } };
}
  ? TBody
  : never;

type QueryParams<TOperation> = TOperation extends { parameters: { query?: infer TQuery } } ? TQuery : never;
type PathParams<TOperation> = TOperation extends { parameters: { path: infer TPath } } ? TPath : never;

type JsonResponse<TOperation, TCode extends number> = TOperation extends { responses: infer TResponses }
  ? TCode extends keyof TResponses
    ? TResponses[TCode] extends { content: { "application/json": infer TPayload } }
      ? TPayload
      : never
    : never
  : never;

type SuccessPayload<TOperation> = JsonResponse<TOperation, 200> extends never
  ? JsonResponse<TOperation, 201>
  : JsonResponse<TOperation, 200>;

function pathWithParams(pathTemplate: string, params: Record<string, string | number>) {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(`{${key}}`, encodeURIComponent(String(value))),
    pathTemplate,
  );
}

export const auth = {
  register: (input: JsonRequestBody<Operation<"/api/auth/register", "post">>) =>
    request<SuccessPayload<Operation<"/api/auth/register", "post">>>("POST", "/api/auth/register", input),
  login: (input: JsonRequestBody<Operation<"/api/auth/login", "post">>) =>
    request<SuccessPayload<Operation<"/api/auth/login", "post">>>("POST", "/api/auth/login", input),
  me: () => request<SuccessPayload<Operation<"/api/auth/me", "get">>>("GET", "/api/auth/me"),
  logout: () => request<SuccessPayload<Operation<"/api/auth/logout", "post">>>("POST", "/api/auth/logout"),
  logoutAll: () => request<SuccessPayload<Operation<"/api/auth/logout-all", "post">>>("POST", "/api/auth/logout-all"),
};

export const profile = {
  get: () => request<SuccessPayload<Operation<"/api/profile", "get">>>("GET", "/api/profile"),
  update: (input: JsonRequestBody<Operation<"/api/profile", "patch">>) =>
    request<SuccessPayload<Operation<"/api/profile", "patch">>>("PATCH", "/api/profile", input),
};

export const lobby = {
  tables: () => request<SuccessPayload<Operation<"/api/lobby/tables", "get">>>("GET", "/api/lobby/tables"),
  listTables: () => request<SuccessPayload<Operation<"/api/lobby/tables", "get">>>("GET", "/api/lobby/tables"),
  createTable: (input: JsonRequestBody<Operation<"/api/lobby/tables", "post">>) =>
    request<SuccessPayload<Operation<"/api/lobby/tables", "post">>>("POST", "/api/lobby/tables", input),
  deleteTable: (tableId: string) =>
    request<void>("DELETE", `/api/lobby/tables/${encodeURIComponent(tableId)}`),
};

export const economy = {
  wallet: () => request<SuccessPayload<Operation<"/api/economy/wallet", "get">>>("GET", "/api/economy/wallet"),
  balance: () => request<SuccessPayload<Operation<"/api/economy/wallet", "get">>>("GET", "/api/economy/wallet"),
  transactions: (query?: QueryParams<Operation<"/api/economy/transactions", "get">>) =>
    request<SuccessPayload<Operation<"/api/economy/transactions", "get">>>("GET", "/api/economy/transactions", undefined, {
      query: query as Record<string, string | number | boolean | null | undefined> | undefined,
    }),
  buyIn: (input: JsonRequestBody<Operation<"/api/economy/buy-in", "post">>) =>
    request<SuccessPayload<Operation<"/api/economy/buy-in", "post">>>("POST", "/api/economy/buy-in", input),
  cashOut: (input: JsonRequestBody<Operation<"/api/economy/cash-out", "post">>) =>
    request<SuccessPayload<Operation<"/api/economy/cash-out", "post">>>("POST", "/api/economy/cash-out", input),
};

export const tables = {
  resume: (
    path: PathParams<Operation<"/api/tables/{tableId}/resume", "post">>,
    input?: components["schemas"]["CashTableResumeRequest"],
  ) =>
    request<SuccessPayload<Operation<"/api/tables/{tableId}/resume", "post">>>(
      "POST",
      pathWithParams("/api/tables/{tableId}/resume", path as Record<string, string | number>),
      input,
    ),
};

export const tournaments = {
  list: (query?: QueryParams<Operation<"/api/tournaments", "get">>) =>
    request<SuccessPayload<Operation<"/api/tournaments", "get">>>("GET", "/api/tournaments", undefined, {
      query: query as Record<string, string | number | boolean | null | undefined> | undefined,
    }),
  create: (input: JsonRequestBody<Operation<"/api/tournaments", "post">>) =>
    request<SuccessPayload<Operation<"/api/tournaments", "post">>>("POST", "/api/tournaments", input),
  get: (path: PathParams<Operation<"/api/tournaments/{id}", "get">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}", "get">>>(
      "GET",
      pathWithParams("/api/tournaments/{id}", path as Record<string, string | number>),
    ),
  register: (path: PathParams<Operation<"/api/tournaments/{id}/register", "post">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}/register", "post">>>(
      "POST",
      pathWithParams("/api/tournaments/{id}/register", path as Record<string, string | number>),
    ),
  unregister: (path: PathParams<Operation<"/api/tournaments/{id}/unregister", "post">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}/unregister", "post">>>(
      "POST",
      pathWithParams("/api/tournaments/{id}/unregister", path as Record<string, string | number>),
    ),
  ensureTable: (path: PathParams<Operation<"/api/tournaments/{id}/ensure-table", "post">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}/ensure-table", "post">>>(
      "POST",
      pathWithParams("/api/tournaments/{id}/ensure-table", path as Record<string, string | number>),
    ),
  standings: (path: PathParams<Operation<"/api/tournaments/{id}/standings", "get">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}/standings", "get">>>(
      "GET",
      pathWithParams("/api/tournaments/{id}/standings", path as Record<string, string | number>),
    ),
  cancel: (path: PathParams<Operation<"/api/tournaments/{id}/cancel", "post">>) =>
    request<SuccessPayload<Operation<"/api/tournaments/{id}/cancel", "post">>>(
      "POST",
      pathWithParams("/api/tournaments/{id}/cancel", path as Record<string, string | number>),
    ),
};

export const admin = {
  listUsers: (query?: QueryParams<Operation<"/api/admin/users", "get">>) =>
    request<SuccessPayload<Operation<"/api/admin/users", "get">>>("GET", "/api/admin/users", undefined, {
      query: query as Record<string, string | number | boolean | null | undefined> | undefined,
    }),
  banUser: (path: PathParams<Operation<"/api/admin/users/{id}/ban", "post">>) =>
    request<SuccessPayload<Operation<"/api/admin/users/{id}/ban", "post">>>(
      "POST",
      pathWithParams("/api/admin/users/{id}/ban", path as Record<string, string | number>),
    ),
  unbanUser: (path: PathParams<Operation<"/api/admin/users/{id}/unban", "post">>) =>
    request<SuccessPayload<Operation<"/api/admin/users/{id}/unban", "post">>>(
      "POST",
      pathWithParams("/api/admin/users/{id}/unban", path as Record<string, string | number>),
    ),
  deleteUser: (path: PathParams<Operation<"/api/admin/users/{id}/delete", "post">>) =>
    request<SuccessPayload<Operation<"/api/admin/users/{id}/delete", "post">>>(
      "POST",
      pathWithParams("/api/admin/users/{id}/delete", path as Record<string, string | number>),
    ),
  restoreUser: (path: PathParams<Operation<"/api/admin/users/{id}/restore", "post">>) =>
    request<SuccessPayload<Operation<"/api/admin/users/{id}/restore", "post">>>(
      "POST",
      pathWithParams("/api/admin/users/{id}/restore", path as Record<string, string | number>),
    ),
  setRole: (
    path: PathParams<Operation<"/api/admin/users/{id}/role", "patch">>,
    input: JsonRequestBody<Operation<"/api/admin/users/{id}/role", "patch">>,
  ) =>
    request<SuccessPayload<Operation<"/api/admin/users/{id}/role", "patch">>>(
      "PATCH",
      pathWithParams("/api/admin/users/{id}/role", path as Record<string, string | number>),
      input,
    ),
};

export const bots = {
  list: () => request<SuccessPayload<Operation<"/api/bots", "get">>>("GET", "/api/bots"),
  stats: (path: PathParams<Operation<"/api/bots/{id}/stats", "get">>) =>
    request<SuccessPayload<Operation<"/api/bots/{id}/stats", "get">>>(
      "GET",
      pathWithParams("/api/bots/{id}/stats", path as Record<string, string | number>),
    ),
};

export function createNamespacedSdk() {
  return { auth, profile, lobby, economy, tables, tournaments, admin, bots };
}
