import { useCallback, useEffect, useState } from "react";
import { getEconomyBalance } from "@/services/get/economy.get";
import { useAuthStore } from "@/stores/auth.store";

export function useBankroll() {
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getEconomyBalance();
      const bal = (data as { bankrollCents?: number })?.bankrollCents ?? 0;
      setCents(Number(bal));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load balance");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return;
    if (!token) {
      setCents(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    getEconomyBalance()
      .then((data) => {
        if (cancelled) return;
        const bal = (data as { bankrollCents?: number })?.bankrollCents ?? 0;
        setCents(Number(bal));
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load balance");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hydrated, token]);

  return { cents: cents ?? 0, error, loading, refresh };
}
