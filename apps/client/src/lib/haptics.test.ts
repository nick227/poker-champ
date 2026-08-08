import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetHapticPolicyStateForTests, triggerHaptic } from "@/lib/haptics";

type PrefState = {
  hapticsEnabled: boolean;
};

const prefs: PrefState = {
  hapticsEnabled: true,
};

vi.mock("@/stores/preferences.store", () => {
  const usePreferencesStore = ((selector?: (s: PrefState) => unknown) =>
    selector ? selector(prefs) : prefs) as unknown as {
    (selector?: (s: PrefState) => unknown): unknown;
    getState: () => PrefState;
  };
  usePreferencesStore.getState = () => prefs;
  return { usePreferencesStore };
});

const impactAsync = vi.fn((_style: unknown) => Promise.resolve());
const notificationAsync = vi.fn((_type: unknown) => Promise.resolve());
const selectionAsync = vi.fn(() => Promise.resolve());

vi.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" },
  impactAsync: (style: unknown) => impactAsync(style),
  notificationAsync: (type: unknown) => notificationAsync(type),
  selectionAsync: () => selectionAsync(),
}));

describe("haptics policy layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    prefs.hapticsEnabled = true;
    impactAsync.mockClear();
    notificationAsync.mockClear();
    selectionAsync.mockClear();
    __resetHapticPolicyStateForTests();
  });

  it("dispatches an impact pattern to the native module", async () => {
    triggerHaptic({ kind: "impact", style: "Medium" });
    await Promise.resolve();
    expect(impactAsync).toHaveBeenCalledWith("medium");
  });

  it("dispatches a notification pattern to the native module", async () => {
    triggerHaptic({ kind: "notification", type: "Success" });
    await Promise.resolve();
    expect(notificationAsync).toHaveBeenCalledWith("success");
  });

  it("dispatches a selection pattern to the native module", async () => {
    triggerHaptic({ kind: "selection" });
    await Promise.resolve();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("does not fire when haptics are disabled in preferences", async () => {
    prefs.hapticsEnabled = false;
    triggerHaptic({ kind: "impact", style: "Light" });
    await Promise.resolve();
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it("applies a short cooldown per physical pattern", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    triggerHaptic({ kind: "impact", style: "Light" });
    now.mockReturnValueOnce(1010);
    triggerHaptic({ kind: "impact", style: "Light" });
    now.mockReturnValueOnce(1090);
    triggerHaptic({ kind: "impact", style: "Light" });
    await Promise.resolve();

    expect(impactAsync).toHaveBeenCalledTimes(2);
  });

  it("does not cross-suppress unrelated patterns within the cooldown window", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    triggerHaptic({ kind: "impact", style: "Light" });
    now.mockReturnValueOnce(1005);
    triggerHaptic({ kind: "notification", type: "Warning" });
    await Promise.resolve();

    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalledTimes(1);
  });

  it("swallows a native dispatch failure instead of throwing", async () => {
    impactAsync.mockRejectedValueOnce(new Error("UnavailabilityError"));
    expect(() => triggerHaptic({ kind: "impact", style: "Heavy" })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
