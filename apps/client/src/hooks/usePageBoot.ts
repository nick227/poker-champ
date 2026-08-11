import { useEffect, useState } from "react";

type Options = {
  /** When set, wait until this has been true at least once (or timeout) before latching. */
  busy?: boolean;
  busyTimeoutMs?: number;
};

/**
 * Latches true once `until` is true (and optional busy cycle completes).
 * Refresh flaps after the first reveal do not re-show the boot veil.
 */
export function usePageBoot(until: boolean, opts?: Options): boolean {
  const trackBusy = opts?.busy != null;
  const [latched, setLatched] = useState(false);
  const [busyGateOpen, setBusyGateOpen] = useState(!trackBusy);

  useEffect(() => {
    if (!trackBusy) return;
    if (opts?.busy) setBusyGateOpen(true);
  }, [opts?.busy, trackBusy]);

  useEffect(() => {
    if (!trackBusy || busyGateOpen) return;
    const t = setTimeout(() => setBusyGateOpen(true), opts?.busyTimeoutMs ?? 900);
    return () => clearTimeout(t);
  }, [trackBusy, busyGateOpen, opts?.busyTimeoutMs]);

  useEffect(() => {
    if (latched) return;
    if (until && busyGateOpen) setLatched(true);
  }, [until, busyGateOpen, latched]);

  return latched;
}
