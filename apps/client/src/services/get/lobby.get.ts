import { serviceRegistry } from "@/registry/service.registry";

export async function getLobbyTables() {
  const res = await serviceRegistry.get.lobbyTables();
  if (!res.ok) throw new Error(res.error.message);
  return res.data.tables ?? [];
}

export type LobbyChatMessageDto = {
  id: string;
  scope: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAtTs: number;
};

export async function getLobbyChatMessages(input?: { scope?: string; cursor?: string; limit?: number }) {
  const res = await serviceRegistry.get.lobbyChatMessages(input);
  if (!res.ok) throw new Error(res.error.message);
  return {
    messages: (res.data.messages ?? []) as LobbyChatMessageDto[],
    nextCursor: res.data.nextCursor ?? null,
  };
}
