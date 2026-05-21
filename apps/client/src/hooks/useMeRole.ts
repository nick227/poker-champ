import { useEffect, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useAuthStore } from "@/stores/auth.store";

export function useMeRole(): { role: string | null; loading: boolean } {
  const token = useAuthStore((s) => s.token);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setRole(null);
      return;
    }

    setLoading(true);
    serviceRegistry.get
      .me()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setRole(null);
          return;
        }
        const maybeRole = (res.data as { user?: { role?: string } })?.user?.role;
        setRole(typeof maybeRole === "string" ? maybeRole : null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return { role, loading };
}
