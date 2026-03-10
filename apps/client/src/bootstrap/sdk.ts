import { SDK_VERSION, auth, setApiBaseUrl, setAuthToken } from "@poker-champ/sdk";
import { preloadSounds, setSoundPlayer } from "@/lib/sound";
import { createExpoAvPlayer } from "@/lib/soundPlayer";
import { storeRegistry } from "@/registry/store.registry";
import { parseProfileFromMe } from "@/lib/profileFromMe";
import { DEFAULT_API_URL, PRELOAD_SOUNDS } from "@/constants";

let booted = false;
let bootPromise: Promise<void> | null = null;
let versionCheckDone = false;
const sdkApiBaseUrl = String(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL);

// Ensure SDK requests have a base URL before React effects run.
setApiBaseUrl(sdkApiBaseUrl);

async function checkVersionMismatchOnce() {
  if (versionCheckDone) return;
  versionCheckDone = true;

  try {
    const me = await auth.me();
    const serverOpenApiVersion =
      me && typeof me === "object" && "openapiVersion" in me ? String((me as { openapiVersion: unknown }).openapiVersion) : null;

    if (serverOpenApiVersion && serverOpenApiVersion !== SDK_VERSION) {
       
      console.warn(
        `[SDK_VERSION_MISMATCH] server=${serverOpenApiVersion} sdk=${SDK_VERSION}. Regenerate or upgrade @poker-champ/sdk.`,
      );
    }
  } catch {
    // No-op: startup telemetry should be non-blocking and non-spammy.
  }
}

export function bootstrapSdk() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    if (booted) return;

    try {
      // Re-apply defensively in case runtime env changed.
      setApiBaseUrl(sdkApiBaseUrl);

      // Store -> SDK context
      setAuthToken(storeRegistry.auth().token);

      storeRegistry.use.auth.subscribe((state) => {
        setAuthToken(state.token);
      });

      await storeRegistry.auth().hydrateToken();
      storeRegistry.auth().markHydrated();

      const token = storeRegistry.auth().token;
      if (token) {
        try {
          const me = await auth.me();
          if (me && typeof me === "object") {
            storeRegistry.profile().setProfile(parseProfileFromMe(me));
          }
        } catch {
          storeRegistry.auth().logout();
        }
      }

      setSoundPlayer(createExpoAvPlayer());
      preloadSounds([...PRELOAD_SOUNDS]);
      void checkVersionMismatchOnce();
    } catch (error) {
      console.error("[bootstrapSdk] startup failed", error);
    } finally {
      booted = true;
    }
  })();

  return bootPromise;
}
