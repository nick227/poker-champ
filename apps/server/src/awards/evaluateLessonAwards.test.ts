import { describe, expect, it } from "vitest";
import { evaluateLessonAwards } from "./evaluateLessonAwards.js";

describe("evaluateLessonAwards", () => {
  it("maps zero-padded lesson ids to lesson completion awards", () => {
    const out = evaluateLessonAwards({
      attempt: { id: "attempt_1", lessonId: "L01", scorePct: 90 },
      lesson: { id: "L01", title: "RFI Discipline By Position" },
      completedLessonCount: 1,
      firstTry: false,
    });

    expect(out.map((c) => c.awardId)).toContain("lesson_complete_L1");
  });

  it("grants module and curriculum thresholds at 12 completed lessons", () => {
    const out = evaluateLessonAwards({
      attempt: { id: "attempt_12", lessonId: "L12", scorePct: 96 },
      lesson: { id: "L12", title: "Capstone Hand Review" },
      completedLessonCount: 12,
      firstTry: true,
    });

    const ids = out.map((c) => c.awardId);
    expect(ids).toContain("first_lesson_ever");
    expect(ids).toContain("lesson_complete_L12");
    expect(ids).toContain("module_A_done");
    expect(ids).toContain("module_B_done");
    expect(ids).toContain("module_C_done");
    expect(ids).toContain("curriculum_done");
    expect(ids).toContain("lesson_sharp");
    expect(ids).toContain("lesson_first_try");
  });

  it("grants perfect but not sharp at 100 percent", () => {
    const out = evaluateLessonAwards({
      attempt: { id: "attempt_2", lessonId: "L02", scorePct: 100 },
      lesson: { id: "L02", title: "3-Bet/Call/Fold Buckets" },
      completedLessonCount: 2,
      firstTry: false,
    });

    const ids = out.map((c) => c.awardId);
    expect(ids).toContain("lesson_perfect");
    expect(ids).not.toContain("lesson_sharp");
    const perfect = out.find((c) => c.awardId === "lesson_perfect");
    expect(perfect?.triggerKey).toBe("perfect_L02_attempt_2");
  });
});
