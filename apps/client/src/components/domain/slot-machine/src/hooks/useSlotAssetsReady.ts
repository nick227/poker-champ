import { useEffect, useMemo, useState } from "react";
import { type ImageSourcePropType } from "react-native";
import { Asset } from "expo-asset";

function toAssetModules(sources: ImageSourcePropType[]): Array<number | string> {
  const out: Array<number | string> = [];
  for (const source of sources) {
    if (typeof source === "number") {
      out.push(source);
      continue;
    }
    if (source && typeof source === "object" && "uri" in source && typeof source.uri === "string") {
      out.push(source.uri);
    }
  }
  return out;
}

/** Resolves once symbol images are decoded/cached (or immediately if nothing to load). */
export function useSlotAssetsReady(symbols: Partial<Record<string, ImageSourcePropType>>): boolean {
  const modules = useMemo(
    () => toAssetModules(Object.values(symbols).filter((s): s is ImageSourcePropType => s != null)),
    [symbols],
  );
  const [ready, setReady] = useState(modules.length === 0);

  useEffect(() => {
    if (modules.length === 0) {
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    void (async () => {
      try {
        const nums = modules.filter((m): m is number => typeof m === "number");
        const uris = modules.filter((m): m is string => typeof m === "string");
        if (nums.length) await Asset.loadAsync(nums);
        if (uris.length) await Asset.loadAsync(uris);
      } catch {
        // Reveal anyway — missing art should not hang the machine.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [modules]);

  return ready;
}
