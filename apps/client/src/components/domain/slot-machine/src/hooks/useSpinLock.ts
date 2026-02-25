import { useRef } from "react";

export function useSpinLock() {
  const lockedRef = useRef(false);
  
  return {
    get locked() { 
      // MVP Rule: Lock must be synchronous and checked first
      return lockedRef.current; 
    },
    lock() { 
      // Synchronous lock - prevents double-spin race
      lockedRef.current = true; 
    },
    unlock() { 
      lockedRef.current = false; 
    },
  };
}
