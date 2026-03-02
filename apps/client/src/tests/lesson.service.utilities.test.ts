import { beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "@poker-champ/sdk";
import { lessonService } from "@/features/lessons/lesson.service";

vi.mock("@poker-champ/sdk", () => ({
  request: vi.fn(),
}));

describe("lesson.service getUtilitiesOverview", () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
    vi.mocked(request).mockResolvedValue({
      communityComparison: {
        lessonId: "lesson_1",
        stepId: null,
        sampleSize: 0,
        minimumSampleSize: 100,
        hasSufficientSample: false,
        actionDistribution: {},
        freshnessTimestamp: null,
        userPercentile: null,
      },
    });
  });

  it("calls utilities endpoint without query when no params are passed", async () => {
    await lessonService.getUtilitiesOverview();
    expect(request).toHaveBeenCalledWith("GET", "/api/lessons/utilities/overview");
  });

  it("encodes lessonId query param", async () => {
    await lessonService.getUtilitiesOverview({ lessonId: "lesson test" });
    expect(request).toHaveBeenCalledWith(
      "GET",
      "/api/lessons/utilities/overview?lessonId=lesson+test",
    );
  });

  it("encodes lessonId + stepId query params", async () => {
    await lessonService.getUtilitiesOverview({
      lessonId: "lesson_1",
      stepId: "step/1",
    });
    expect(request).toHaveBeenCalledWith(
      "GET",
      "/api/lessons/utilities/overview?lessonId=lesson_1&stepId=step%2F1",
    );
  });
});

