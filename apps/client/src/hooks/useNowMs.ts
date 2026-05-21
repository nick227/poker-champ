import { useEffect, useState } from "react";

/** Wall-clock ms, updated every `tickMs` (default 1s) for live countdowns. */
export function useNowMs(tickMs = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return nowMs;
}
