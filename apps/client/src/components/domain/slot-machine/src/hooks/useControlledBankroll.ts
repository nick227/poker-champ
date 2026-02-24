import { useCallback, useState } from "react";

export function useControlledBankroll({
  bankrollCents,
  onBankrollChange,
  initialBankrollCents,
}: {
  bankrollCents?: number;
  onBankrollChange?: (next: number) => void;
  initialBankrollCents: number;
}) {
  const [internal, setInternal] = useState(initialBankrollCents);
  const value = bankrollCents ?? internal;

  const setValue = useCallback(
    (next: number | ((prev: number) => number)) => {
      const computed = typeof next === "function" ? (next as any)(value) : next;
      if (onBankrollChange) onBankrollChange(computed);
      else setInternal(computed);
    },
    [onBankrollChange, value]
  );

  return { bankrollCents: value, setBankrollCents: setValue };
}
