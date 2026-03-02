import { View } from "react-native";
import { Text } from "../base/Text";
import { Button } from "../base/Button";
import { PremiumContentBadge } from "../base/PremiumContentBadge";
import { useMembership } from "@/hooks/useMembership";

interface ValuePropositionProps {
  onUpgrade?: () => void;
  className?: string;
}

export function ValueProposition({ onUpgrade, className = "" }: ValuePropositionProps) {
  const { isPremiumMember, isLifetimeMember } = useMembership();

  const features = [
    {
      title: "Structured Boot Camp",
      description: "12-lesson curriculum covering the most common cash game mistakes",
      isPremium: true,
      hasAccess: isPremiumMember(),
    },
    {
      title: "Interactive Decision Training",
      description: "Practice real scenarios at the virtual table with immediate feedback",
      isPremium: true,
      hasAccess: isPremiumMember(),
    },
    {
      title: "Clear Feedback System",
      description: "Learn exactly why your decisions work or don't with detailed explanations",
      isPremium: true,
      hasAccess: isPremiumMember(),
    },
    {
      title: "Repeatable Drills",
      description: "Master high-frequency spots through targeted repetition",
      isPremium: true,
      hasAccess: isPremiumMember(),
    },
    {
      title: "Lifetime Updates",
      description: "Get access to all new lessons and features as we add them",
      isPremium: true,
      hasAccess: isLifetimeMember(),
    },
  ];

  return (
    <View className={`space-y-4 ${className}`}>
      {features.map((feature, index) => (
        <FeatureItem
          key={index}
          title={feature.title}
          description={feature.description}
          isPremium={feature.isPremium}
          hasAccess={feature.hasAccess}
        />
      ))}
    </View>
  );
}

function FeatureItem({ 
  title, 
  description, 
  isPremium, 
  hasAccess 
}: { 
  title: string; 
  description: string; 
  isPremium: boolean; 
  hasAccess: boolean; 
}) {
  return (
    <View className="flex-row gap-3 bg-gray-800 rounded-lg p-4">
      <View className="flex-1">
        <View className="flex-row items-center gap-2 mb-2">
          <Text variant="body" className="text-white font-semibold">
            {title}
          </Text>
          {isPremium && (
            <PremiumContentBadge 
              isPremium={isPremium}
              hasAccess={hasAccess}
              size="small"
            />
          )}
        </View>
        <Text variant="caption" className="text-gray-400">
          {description}
        </Text>
      </View>
    </View>
  );
}
