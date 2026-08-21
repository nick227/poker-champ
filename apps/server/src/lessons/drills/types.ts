/** Declarative question model + DTOs for the Drills lesson format. */

export type DrillCategory =
  | "MATCHUP_EQUITY"
  | "OUT_COUNTING"
  | "BET_SIZING"
  | "RULE_OF_2_4"
  | "POT_ODDS";

export type DrillStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

export type DrillQuestion = {
  id: string;
  category: DrillCategory;
  street?: DrillStreet;
  prompt: string;
  heroHand?: string[];
  villainHand?: string[];
  board?: string[];
  contextLines?: string[];
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type DrillLessonConfig = {
  drillType: DrillCategory;
  questionCount: number;
};

export type DrillSessionResponseDto = {
  sessionId: string;
  lessonId: string;
  title: string;
  questions: DrillQuestion[];
};

export type SubmitDrillAnswersBodyDto = {
  sessionId: string;
  answers: Array<{ questionId: string; selectedIndex: number }>;
};

export type CompleteDrillAttemptResponseDto = {
  attempt: {
    id: string;
    lessonId: string;
    status: string;
    scorePct: number | null;
  };
  correctCount: number;
  totalCount: number;
  awardsGranted?: Array<{ awardId: string; reason: string }>;
};
