import { useEffect, useState } from "react";
import { getEconomyBalance } from "@/services/get/economy.get";

export function useBankroll() {
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEconomyBalance()
      .then((data) => {
        if (!cancelled) {
          const bal = (data as { bankrollCents?: number })?.bankrollCents ?? 0;
          setCents(Number(bal));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load balance");
      });
    return () => { cancelled = true; };
  }, []);

  return { cents: cents ?? 0, error };
}
