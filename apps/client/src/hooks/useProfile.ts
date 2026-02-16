import { useEffect, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";

type Profile = { username?: string; location?: string };

export function useProfile(): Profile {
  const [profile, setProfile] = useState<Profile>({});

  useEffect(() => {
    let cancelled = false;
    serviceRegistry.get.me()
      .then((res) => {
        if (!cancelled && res.ok && res.data) {
          const d = res.data as { user?: { username?: string; displayName?: string; email?: string } };
          const u = d.user;
          setProfile({
            username:
              (typeof u?.username === "string" ? u.username : null) ??
              (typeof u?.displayName === "string" ? u.displayName : null) ??
              (typeof u?.email === "string" ? u.email : null) ??
              "Player",
            location: undefined,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return profile;
}
