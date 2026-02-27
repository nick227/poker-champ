import { SDK_VERSION, auth, setApiBaseUrl, setAuthToken } from "@poker-champ/sdk";
import { preloadSounds, setSoundPlayer } from "@/lib/sound";
import { createExpoAvPlayer } from "@/lib/soundPlayer";
import { storeRegistry } from "@/registry/store.registry";
import { DEFAULT_API_URL, PRELOAD_SOUNDS } from "@/constants";

let booted = false;
let bootPromise: Promise<void> | null = null;
let versionCheckDone = false;

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
      const apiUrl =
        process.env.EXPO_PUBLIC_API_URL ||
        DEFAULT_API_URL;

      setApiBaseUrl(String(apiUrl));

      // Store -> SDK context
      setAuthToken(storeRegistry.auth().token);

      storeRegistry.use.auth.subscribe((state) => {
        setAuthToken(state.token);
      });

      await storeRegistry.auth().hydrateToken();

      const token = storeRegistry.auth().token;
      if (token) {
        try {
          await auth.me();
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
      storeRegistry.auth().markHydrated();
      booted = true;
    }
  })();

  return bootPromise;
}
