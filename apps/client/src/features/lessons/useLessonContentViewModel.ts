import { useMemo } from "react";
import { LESSON_CONTENT_COPY, type LessonContentButtonKey } from "./lessonContent.data";

export type HeaderBadge = {
  id: string;
  type: "chip" | "text";
  content: string;
};

export type NavigationButtonDescriptor = {
  id: string;
  key: LessonContentButtonKey;
  onPress: () => void;
  disabled: boolean;
  variant?: "ghost";
};

function buildHeaderBadges(tierLabel: string | null): HeaderBadge[] {
  return [
    {
      id: "poker-school",
      type: "chip",
      content: LESSON_CONTENT_COPY.panel.productBadge,
    },
    ...(tierLabel
      ? [
          {
            id: "tier",
            type: "text" as const,
            content: `${LESSON_CONTENT_COPY.panel.tierPrefix} ${tierLabel}`,
          },
        ]
      : []),
  ];
}

function buildNavigationButtons(context: {
  showStepNavigation: boolean;
  answeredQuestionStep: boolean;
  showInfoNavigation: boolean;
  canGoPrev: boolean;
  isMigratedActionStep: boolean;
  advancing: boolean;
  onRetry: () => void;
  onReloadDecisionRuntime: () => void;
  onPrev: () => void;
  onNext: () => void;
}): NavigationButtonDescriptor[] {
  if (!context.showStepNavigation) return [];
  return [
    {
      id: "left",
      key: context.answeredQuestionStep ? "RETRY" : "PREV",
      onPress: () => {
        if (context.answeredQuestionStep) {
          context.onRetry();
          if (context.isMigratedActionStep) context.onReloadDecisionRuntime();
          return;
        }
        if (context.showInfoNavigation) context.onPrev();
      },
      disabled: context.showInfoNavigation ? !context.canGoPrev : false,
      variant: "ghost",
    },
    {
      id: "right",
      key: "NEXT",
      onPress: context.onNext,
      disabled: context.advancing,
    },
  ];
}

export function useLessonContentViewModel(params: {
  tierLabel: string | null;
  showStepNavigation: boolean;
  answeredQuestionStep: boolean;
  showInfoNavigation: boolean;
  canGoPrev: boolean;
  isMigratedActionStep: boolean;
  advancing: boolean;
  onRetry: () => void;
  onReloadDecisionRuntime: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return useMemo(
    () => ({
      headerBadges: buildHeaderBadges(params.tierLabel),
      navigationButtons: buildNavigationButtons({
        showStepNavigation: params.showStepNavigation,
        answeredQuestionStep: params.answeredQuestionStep,
        showInfoNavigation: params.showInfoNavigation,
        canGoPrev: params.canGoPrev,
        isMigratedActionStep: params.isMigratedActionStep,
        advancing: params.advancing,
        onRetry: params.onRetry,
        onReloadDecisionRuntime: params.onReloadDecisionRuntime,
        onPrev: params.onPrev,
        onNext: params.onNext,
      }),
    }),
    [
      params.tierLabel,
      params.showStepNavigation,
      params.answeredQuestionStep,
      params.showInfoNavigation,
      params.canGoPrev,
      params.isMigratedActionStep,
      params.advancing,
      params.onRetry,
      params.onReloadDecisionRuntime,
      params.onPrev,
      params.onNext,
    ],
  );
}
