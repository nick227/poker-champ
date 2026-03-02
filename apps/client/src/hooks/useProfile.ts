import { useCallback, useEffect } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { parseProfileFromMe, type Profile } from "@/lib/profileFromMe";
import { useProfileStore } from "@/stores/profile.store";

export type { Profile };

export function useProfile(): Profile & { refetch: () => Promise<void> } {
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);

  const refetch = useCallback(async () => {
    const res = await serviceRegistry.get.me();
    if (res.ok && res.data) {
      setProfile(parseProfileFromMe(res.data));
    }
  }, [setProfile]);

  useEffect(() => {
    if (profile.username != null && profile.userId != null) return;
    let cancelled = false;
    serviceRegistry.get.me()
      .then((res) => {
        if (!cancelled && res.ok && res.data) {
          setProfile(parseProfileFromMe(res.data));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile.username, profile.userId, setProfile]);

  return { ...profile, refetch };
}
