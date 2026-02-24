import { useRef } from "react";
export function useSpinLock() {
  const lockedRef = useRef(false);
  return {
    get locked() { return lockedRef.current; },
    lock() { lockedRef.current = true; },
    unlock() { lockedRef.current = false; },
  };
}
