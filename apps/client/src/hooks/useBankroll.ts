import { useCallback, useEffect, useState } from "react";
import { getEconomyBalance } from "@/services/get/economy.get";
import { useAuthStore } from "@/stores/auth.store";
import { useBankrollStore } from "@/stores/bankroll.store";

export function useBankroll() {
  const cents = useBankrollStore((s) => s.cents);
  const setCents = useBankrollStore((s) => s.setCents);
  const clear = useBankrollStore((s) => s.clear);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load balance";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token, setCents]);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return;
    if (!token) {
      clear();
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
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load balance";
        setError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, token, setCents, clear]);

  return { cents: cents ?? 0, error, loading, refresh, setCents };
}
