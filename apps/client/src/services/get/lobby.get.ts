import { serviceRegistry } from "@/registry/service.registry";

export async function getLobbyTables() {
  const res = await serviceRegistry.get.lobbyTables();
  if (!res.ok) throw new Error(res.error.message);
  return res.data.tables ?? [];
}
