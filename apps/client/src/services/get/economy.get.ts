import { serviceRegistry } from "@/registry/service.registry";

export async function getEconomyBalance() {
  const res = await serviceRegistry.get.economyWallet();
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
