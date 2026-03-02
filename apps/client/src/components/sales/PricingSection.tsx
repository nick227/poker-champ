import { View } from "react-native";
import { Text } from "../base/Text";
import { Button } from "../base/Button";
import { MembershipButton } from "../base/MembershipButton";
import { MONETIZATION_FEATURES } from "@/config/features";

export function PricingSection({ className = "" }: { className?: string }) {
  const isFoundingMemberPricing = MONETIZATION_FEATURES.FOUNDING_MEMBER_PRICING;

  return (
    <View className={`space-y-6 ${className}`}>
      <Text variant="h2" className="text-2xl font-bold text-white text-center mb-6">
        Simple, Transparent Pricing
      </Text>
      
      {/* Main Pricing Card */}
      <View className="bg-gradient-to-br from-brand to-brand-bright rounded-lg p-6 border border-brand-bright/30">
        <View className="items-center mb-6">
          <Text variant="h2" className="text-xl font-bold text-white mb-2">
            Lifetime Membership
          </Text>
          
          {isFoundingMemberPricing && (
            <View className="bg-yellow-500/20 px-3 py-1 rounded-full mb-3">
              <Text variant="caption" className="text-yellow-300 font-semibold">
                Founding Member Pricing
              </Text>
            </View>
          )}
          
          <View className="items-center mb-4">
            <Text variant="h1" className="text-4xl font-bold text-white">
              ${MONETIZATION_FEATURES.PREMIUM_PRICE}
            </Text>
            <Text variant="body" className="text-gray-200">
              one-time payment
            </Text>
          </View>
          
          <Text variant="body" className="text-gray-200 text-center mb-6">
            Lock in permanent access to a growing poker training program
          </Text>
        </View>

        <MembershipButton 
          variant="primary"
          className="w-full mb-4"
          customMessage="Get Lifetime Access"
        />

        <Text variant="caption" className="text-gray-300 text-center">
          Secure payment powered by Stripe • 30-day money-back guarantee
        </Text>
      </View>

      {/* Value Comparison */}
      <View className="bg-gray-800 rounded-lg p-4">
        <Text variant="h2" className="text-lg font-semibold text-white mb-4 text-center">
          What You Get
        </Text>
        
        <ValueComparison />
      </View>

      {/* Urgency/Trust Elements */}
      <View className="space-y-3">
        <TrustElement
          icon="✓"
          title="30-Day Money-Back Guarantee"
          description="Try it risk-free. If you're not satisfied, get a full refund."
        />
        
        <TrustElement
          icon="✓"
          title="Lifetime Updates"
          description="All future lessons and features included at no extra cost."
        />
        
        <TrustElement
          icon="✓"
          title="One-Time Payment"
          description="No monthly fees. Pay once and access forever."
        />
        
        {isFoundingMemberPricing && (
          <TrustElement
            icon="⚡"
            title="Limited Founding Member Price"
            description="Lock in this price before it increases for new members."
          />
        )}
      </View>
    </View>
  );
}

function ValueComparison() {
  const features = [
    { name: "12-Lesson Boot Camp", included: true },
    { name: "Interactive Decision Practice", included: true },
    { name: "Progress Tracking", included: true },
    { name: "Lifetime Content Updates", included: true },
    { name: "Premium Community Access", included: true },
  ];

  return (
    <View className="space-y-2">
      {features.map((feature, index) => (
        <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-700">
          <Text variant="body" className="text-gray-300">
            {feature.name}
          </Text>
          <Text variant="body" className="text-green-400 font-semibold">
            {feature.included ? "Included" : "Not Included"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TrustElement({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View className="flex-row gap-3">
      <Text variant="body" className="text-green-400 font-semibold text-lg">
        {icon}
      </Text>
      <View className="flex-1">
        <Text variant="body" className="text-white font-semibold mb-1">
          {title}
        </Text>
        <Text variant="caption" className="text-gray-400">
          {description}
        </Text>
      </View>
    </View>
  );
}
