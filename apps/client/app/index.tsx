import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";
import { getDefaultRoute } from "@/registry/screen.registry";

export default function Index() {
  const isAuthed = useAuthStore((s) => !!s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  if (!hydrated) return null;
  return <Redirect href={getDefaultRoute(isAuthed)} />;
}
