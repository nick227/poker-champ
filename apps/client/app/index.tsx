import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";
import { getDefaultRoute } from "@/registry/screen.registry";
import { LoadingScreen } from "@/components/domain/loading/LoadingScreen";

export default function Index() {
  const isAuthed = useAuthStore((s) => !!s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  if (!hydrated) return <LoadingScreen />;
  return <Redirect href={getDefaultRoute(isAuthed)} />;
}
