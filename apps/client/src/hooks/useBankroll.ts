import { useCallback, useEffect, useState } from "react";
import { getEconomyBalance } from "@/services/get/economy.get";

export function useBankroll() {
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getEconomyBalance();
      const bal = (data as { bankrollCents?: number })?.bankrollCents ?? 0;
      setCents(Number(bal));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load balance");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

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
      });

    return () => { cancelled = true; };
  }, []);

  return { cents: cents ?? 0, error, refresh };
}
