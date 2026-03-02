import { View, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/base/Text';
import { Button } from '@/components/base/Button';
import { MembershipButton } from '@/components/base/MembershipButton';
import { TipButton } from '@/components/base/TipButton';
import { PremiumContentBadge } from '@/components/base/PremiumContentBadge';
import { ValueProposition } from '@/components/sales/ValueProposition';
import { SocialProof } from '@/components/sales/SocialProof';
import { PricingSection } from '@/components/sales/PricingSection';
import { FAQSection } from '@/components/sales/FAQSection';
import { useMembership } from '@/hooks/useMembership';
import { MONETIZATION_FEATURES } from '@/config/features';

export default function MembershipPage() {
  const { 
    membership, 
    loading, 
    isLifetimeMember, 
    isPremiumMember, 
    getMembershipDisplay,
    getPurchasedDate,
    createCheckoutSession 
  } = useMembership();

  const handlePurchase = async () => {
    try {
      const result = await createCheckoutSession();
      if (result.success && result.url) {
        // The MembershipButton component will handle opening the URL
        console.log('Checkout session created:', result.url);
      }
    } catch (error) {
      console.error('Purchase error:', error);
    }
  };

  const membershipDisplay = getMembershipDisplay();

  return (
    <ScrollView className="flex-1 bg-gray-900">
      <View className="p-6">
        {/* Hero Section */}
        <View className="mb-8">
          <Text variant="h1" className="text-4xl font-bold text-white mb-4 text-center">
            Become a More Disciplined, Profitable Poker Player
          </Text>
          <Text variant="body" className="text-lg text-gray-300 text-center mb-6">
            Structured lessons, interactive decision practice, and lifetime access to a growing poker training program
          </Text>
          
          <View className="flex-row justify-center gap-4 mb-6">
            <MembershipButton 
              variant="primary"
              className="flex-1 max-w-xs"
            />
            <Button
              title="Continue Free Access"
              variant="ghost"
              className="flex-1 max-w-xs"
              onPress={() => {
                // Navigate back to lessons or lobby
                console.log('Continue free access');
              }}
            />
          </View>
        </View>

        {/* What Makes Poker Champ Different */}
        <View className="mb-8">
          <Text variant="h2" className="text-2xl font-bold text-white mb-4">
            Built for Real Online Play
          </Text>
          
          <ValueProposition onUpgrade={handlePurchase} />
        </View>

        {/* Social Proof */}
        <SocialProof className="mb-8" />

        {/* Pricing Section */}
        <PricingSection className="mb-8" />

        {/* FAQ Section */}
        <FAQSection className="mb-8" />

        {/* Program Overview */}
        <View className="mb-8">
          <Text variant="h2" className="text-2xl font-bold text-white mb-4">
            Complete Poker Improvement Program
          </Text>
          
          <View className="bg-gray-800 rounded-lg p-4 mb-4">
            <Text variant="body" className="text-gray-300 mb-2">
              <Text className="font-semibold text-white">12-Lesson Boot Camp:</Text> Structured curriculum from fundamentals to advanced strategy
            </Text>
            <Text variant="body" className="text-gray-300 mb-2">
              <Text className="font-semibold text-white">Interactive Decision Practice:</Text> Apply what you learn in realistic scenarios
            </Text>
            <Text variant="body" className="text-gray-300">
              <Text className="font-semibold text-white">Growing Content Library:</Text> New lessons and drills added regularly
            </Text>
          </View>

          <View className="bg-brand/10 border border-brand/30 rounded-lg p-4">
            <Text variant="body" className="text-brand text-center mb-2">
              One-time payment of ${MONETIZATION_FEATURES.PREMIUM_PRICE}
            </Text>
            <Text variant="caption" className="text-gray-400 text-center">
              Lock in permanent access before prices increase
            </Text>
          </View>
        </View>

        {/* Current Membership Status */}
        {membership && (
          <View className="mb-8">
            <Text variant="h2" className="text-2xl font-bold text-white mb-4">
              Your Membership Status
            </Text>
            
            <View className="bg-gray-800 rounded-lg p-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text variant="body" className="text-white">
                  Status: {membershipDisplay.status}
                </Text>
                <PremiumContentBadge 
                  isPremium={true}
                  hasAccess={isPremiumMember()}
                  requiredTier={membership.type}
                />
              </View>
              
              <Text variant="caption" className="text-gray-400">
                Member since: {getPurchasedDate()?.toLocaleDateString()}
              </Text>
              
              {membership.type === 'lifetime' && (
                <Text variant="caption" className="text-green-400 mt-1">
                  Lifetime access - never expires
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Support Section */}
        <View className="mb-8">
          <Text variant="h2" className="text-2xl font-bold text-white mb-4">
            Support Poker Champ Development
          </Text>
          
          <TipButton 
            customMessage="Enjoying the free content? Support our development with a tip!"
            className="mb-4"
          />
          
          <Text variant="caption" className="text-gray-400 text-center">
            Your support helps us add more lessons and features
          </Text>
        </View>

        {/* Trust Signals */}
        <View className="mb-8">
          <View className="flex-row justify-center items-center gap-2">
            <Text variant="caption" className="text-gray-400">
              Secure payments powered by
            </Text>
            <Text variant="caption" className="text-brand font-semibold">
              Stripe
            </Text>
          </View>
          
          <Text variant="caption" className="text-gray-400 text-center mt-2">
            30-day money-back guarantee • Cancel anytime
          </Text>
        </View>
      </View>
    </ScrollView>
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
    <View className="flex-row gap-3">
      <View className="flex-1">
        <View className="flex-row items-center gap-2 mb-1">
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
