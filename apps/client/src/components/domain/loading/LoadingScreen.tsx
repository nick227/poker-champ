import { Screen } from "@/components/containers/Screen";

/** Full-screen boot veil (same as primary page preload). */
export function LoadingScreen() {
  return <Screen ready={false}>{null}</Screen>;
}
