import { describe, it, expect, vi, beforeEach } from "vitest";
import { historyService } from "@/services/history.service";
import { request } from "@poker-champ/sdk";

vi.mock("@poker-champ/sdk", () => ({
  request: vi.fn(),
}));

describe("history.service getHands", () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  it("parses API shape { hands: [...], nextCursor } and normalizes playedAt to Date", async () => {
    const iso = "2025-02-21T12:00:00.000Z";
    vi.mocked(request).mockResolvedValue({
      hands: [
        {
          id: "hand_1",
          playedAt: iso,
          tableName: "Table 1",
          netResultCents: 100,
          bigBlindCents: 200,
          heroWonCents: 400,
          hasReplay: false,
        },
      ],
      nextCursor: "cursor_abc",
    });

    const result = await historyService.getHands({ token: "t" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hands).toHaveLength(1);
    expect(result.data.hands[0].id).toBe("hand_1");
    expect(result.data.hands[0].playedAt).toBeInstanceOf(Date);
    expect(result.data.hands[0].playedAt.toISOString()).toBe(iso);
    expect(result.data.nextCursor).toBe("cursor_abc");
  });

  it("returns empty hands when API returns hands: null or missing (defensive)", async () => {
    vi.mocked(request).mockResolvedValue({ nextCursor: null });
    const result = await historyService.getHands({ token: "t" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hands).toEqual([]);
    expect(result.data.nextCursor).toBeNull();
  });

  it("returns empty hands when API returns wrong key (e.g. data.hands)", async () => {
    vi.mocked(request).mockResolvedValue({ data: { hands: [{ id: "hand_1" }] }, nextCursor: null });
    const result = await historyService.getHands({ token: "t" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hands).toEqual([]);
  });
});
