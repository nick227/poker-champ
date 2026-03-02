import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function HistoryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return null;
}
