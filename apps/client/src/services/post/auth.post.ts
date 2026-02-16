import { serviceRegistry } from "@/registry/service.registry";

export async function postAuthRegister(input: { email: string; password: string; displayName?: string; username?: string }) {
  const res = await serviceRegistry.post.authRegister(input);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function postAuthLogin(input: { email: string; password: string }) {
  const res = await serviceRegistry.post.authLogin(input);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function postAuthLogout(): Promise<void> {
  const res = await serviceRegistry.post.authLogout();
  if (!res.ok) return;
}
