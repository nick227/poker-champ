import { serviceRegistry } from "@/registry/service.registry";

export async function postEconomyDeposit() {
  const res = await serviceRegistry.post.economyDeposit();
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
