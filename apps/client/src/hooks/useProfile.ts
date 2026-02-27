import { useCallback, useEffect, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { getAvatarUrlFromMeResponse } from "@/lib/meResponse";

export type Profile = {
  username?: string;
  location?: string;
  userId?: string;
  avatarUrl?: string | null;
};

function parseProfileFromMe(d: unknown): Profile {
  const u = (d as { user?: { id?: string; username?: string; displayName?: string; email?: string } })?.user;
  return {
    userId:
      typeof u?.id === "string" && u.id.length > 0
        ? u.id
        : typeof u?.id === "number"
          ? String(u.id)
          : undefined,
    username:
      (typeof u?.username === "string" ? u.username : null) ??
      (typeof u?.displayName === "string" ? u.displayName : null) ??
      (typeof u?.email === "string" ? u.email : null) ??
      "Player",
    location: undefined,
    avatarUrl: getAvatarUrlFromMeResponse(d),
  };
}

export function useProfile(): Profile & { refetch: () => Promise<void> } {
  const [profile, setProfile] = useState<Profile>({});

  const refetch = useCallback(async () => {
    const res = await serviceRegistry.get.me();
    if (res.ok && res.data) {
      setProfile(parseProfileFromMe(res.data));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    serviceRegistry.get.me()
      .then((res) => {
        if (!cancelled && res.ok && res.data) {
          setProfile(parseProfileFromMe(res.data));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return { ...profile, refetch };
}
