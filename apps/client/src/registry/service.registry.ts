import { auth, economy, lobby, request, tournaments } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";
import type { ServiceResult } from "@/services/_helpers/serviceTypes";

const serviceByKey = {
  get: {
    lobbyTables: () => withApiError(() => lobby.listTables()),
    economyWallet: () => withApiError(() => economy.wallet()),
    economyTransactions: (limit?: number) => withApiError(() => economy.transactions(limit ? { limit } : undefined)),
    tournaments: (status?: string) => withApiError(() => tournaments.list(status ? { status } : undefined)),
    me: () => withApiError(() => auth.me()),
  },
  post: {
    authRegister: (input: { email: string; password: string; displayName?: string; username?: string }) =>
      withApiError(() => auth.register(input)),
    authLogin: (input: { email: string; password: string }) => withApiError(() => auth.login(input)),
    authLogout: () => withApiError(() => auth.logout()),
    joinTable: (input: {
      maxSeats: number;
      speed: "normal" | "fast";
      name?: string;
      smallBlindCents?: number;
      bigBlindCents?: number;
      minBuyInCents?: number;
      maxBuyInCents?: number;
      visibility?: "PUBLIC" | "PRIVATE";
      password?: string;
    }) => withApiError(() => lobby.createTable(input as any)),
    deleteTable: (tableId: string) => withApiError(() => lobby.deleteTable(tableId)),
    buyIn: (input: { tableId: string; amountCents: number; externalRef?: string }) =>
      withApiError(() => economy.buyIn(input)),
    economyDeposit: () =>
      withApiError(() => request<{ bankrollCents: number }>("POST", "/api/economy/deposit")),
  },
} as const;

const serviceOrdered = [
  { key: "get.lobbyTables", call: serviceByKey.get.lobbyTables },
  { key: "get.economyWallet", call: serviceByKey.get.economyWallet },
  { key: "get.economyTransactions", call: serviceByKey.get.economyTransactions },
  { key: "get.tournaments", call: serviceByKey.get.tournaments },
  { key: "get.me", call: serviceByKey.get.me },
  { key: "post.authRegister", call: serviceByKey.post.authRegister },
  { key: "post.authLogin", call: serviceByKey.post.authLogin },
  { key: "post.authLogout", call: serviceByKey.post.authLogout },
  { key: "post.joinTable", call: serviceByKey.post.joinTable },
  { key: "post.deleteTable", call: serviceByKey.post.deleteTable },
  { key: "post.buyIn", call: serviceByKey.post.buyIn },
  { key: "post.economyDeposit", call: serviceByKey.post.economyDeposit },
] as const;

export const serviceRegistry = {
  byKey: serviceByKey,
  ordered: serviceOrdered,
  get: serviceByKey.get,
  post: serviceByKey.post,
} as const;

export type ServiceRegistry = typeof serviceRegistry;
export type ServiceCallResult<T extends (...args: any[]) => Promise<ServiceResult<any>>> = Awaited<ReturnType<T>>;
