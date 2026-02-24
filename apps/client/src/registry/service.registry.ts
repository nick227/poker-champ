import { auth, economy, lobby, request, tournaments } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";
import type { ServiceResult } from "@/services/_helpers/serviceTypes";
import { DEFAULT_PAGE_SIZE } from "@/constants";

const serviceByKey = {
  get: {
    lobbyTables: () => withApiError(() => lobby.listTables()),
    lobbyChatMessages: (input?: { scope?: string; cursor?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (input?.scope) params.set("scope", input.scope);
      if (input?.cursor) params.set("cursor", input.cursor);
      if (typeof input?.limit === "number") params.set("limit", String(input.limit));
      const query = params.toString();
      const path = query.length > 0 ? `/api/lobby/chat/messages?${query}` : "/api/lobby/chat/messages";
      return withApiError(() =>
        request<{
          messages: Array<{
            id: string;
            scope: string;
            senderUserId: string;
            senderName: string;
            text: string;
            createdAtTs: number;
          }>;
          nextCursor: string | null;
        }>("GET", path),
      );
    },
    economyWallet: () => withApiError(() => economy.wallet()),
    economyTransactions: (limit?: number) => withApiError(() => economy.transactions(limit ? { limit } : undefined)),
    tournaments: (status?: string) => withApiError(() => tournaments.list(status ? { status } : undefined)),
    me: () => withApiError(() => auth.me()),
    adminUsers: (page: number = 1, limit: number = DEFAULT_PAGE_SIZE) =>
      withApiError(() =>
        request<{
          users: Array<{
            id: string;
            email: string;
            displayName: string;
            username?: string | null;
            role: string;
            isBanned: boolean;
            deletedAt?: string | null;
            stats?: {
              lastOnlineAt?: string | null;
              totalOnlineHours?: number;
              totalSpendCents?: number;
              totalLostCents?: number;
              totalBuyInCents?: number;
              totalCashOutCents?: number;
              totalTournamentEntryCents?: number;
              totalTournamentPayoutCents?: number;
            };
          }>;
          total: number;
        }>(
          "GET",
          `/api/admin/users?page=${page}&limit=${limit}`,
        ),
      ),
  },
  post: {
    authRegister: (input: { email: string; password: string; displayName?: string; username?: string }) =>
      withApiError(() => auth.register(input)),
    authLogin: (input: { email: string; password: string }) => withApiError(() => auth.login(input)),
    authLogout: () => withApiError(() => auth.logout()),
    joinTable: (input: {
      name: string;
      maxSeats: number;
      smallBlindCents: number;
      bigBlindCents: number;
      minBuyInCents: number;
      maxBuyInCents: number;
      visibility: "PUBLIC" | "PRIVATE";
      password?: string;
      showStats?: boolean;
    }) => withApiError(() => lobby.createTable(input)),
    deleteTable: (tableId: string) => withApiError(() => lobby.deleteTable(tableId)),
    buyIn: (input: { tableId: string; amountCents: number; externalRef?: string }) =>
      withApiError(() => economy.buyIn(input)),
    economyDeposit: () =>
      withApiError(() => request<{ bankrollCents: number }>("POST", "/api/economy/deposit")),
    adminPromoteUser: (userId: string) =>
      withApiError(() => request("PATCH", `/api/admin/users/${userId}/promote`)),
    adminSuspendUser: (userId: string) =>
      withApiError(() => request("POST", `/api/admin/users/${userId}/ban`)),
    adminDeleteUser: (userId: string) =>
      withApiError(() => request("POST", `/api/admin/users/${userId}/delete`)),
  },
} as const;

const serviceOrdered = [
  { key: "get.lobbyTables", call: serviceByKey.get.lobbyTables },
  { key: "get.lobbyChatMessages", call: serviceByKey.get.lobbyChatMessages },
  { key: "get.economyWallet", call: serviceByKey.get.economyWallet },
  { key: "get.economyTransactions", call: serviceByKey.get.economyTransactions },
  { key: "get.tournaments", call: serviceByKey.get.tournaments },
  { key: "get.me", call: serviceByKey.get.me },
  { key: "get.adminUsers", call: serviceByKey.get.adminUsers },
  { key: "post.authRegister", call: serviceByKey.post.authRegister },
  { key: "post.authLogin", call: serviceByKey.post.authLogin },
  { key: "post.authLogout", call: serviceByKey.post.authLogout },
  { key: "post.joinTable", call: serviceByKey.post.joinTable },
  { key: "post.deleteTable", call: serviceByKey.post.deleteTable },
  { key: "post.buyIn", call: serviceByKey.post.buyIn },
  { key: "post.economyDeposit", call: serviceByKey.post.economyDeposit },
  { key: "post.adminPromoteUser", call: serviceByKey.post.adminPromoteUser },
  { key: "post.adminSuspendUser", call: serviceByKey.post.adminSuspendUser },
  { key: "post.adminDeleteUser", call: serviceByKey.post.adminDeleteUser },
] as const;

export const serviceRegistry = {
  byKey: serviceByKey,
  ordered: serviceOrdered,
  get: serviceByKey.get,
  post: serviceByKey.post,
} as const;

export type ServiceRegistry = typeof serviceRegistry;
export type ServiceCallResult<T extends (...args: any[]) => Promise<ServiceResult<any>>> = Awaited<ReturnType<T>>;
