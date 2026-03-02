import { useState } from "react";
import { View, Text, Alert, Linking } from "react-native";
import { Button } from "./Button";
import { Text as BaseText } from "./Text";
import { MONETIZATION_FEATURES } from "@/config/features";
import { useTips } from "@/hooks/useTips";

interface TipButtonProps {
  className?: string;
  showAmountOptions?: boolean;
  customMessage?: string;
}

const TIP_AMOUNTS = [
  { label: "$5", amount: 500 },
  { label: "$10", amount: 1000 },
  { label: "$25", amount: 2500 },
];

export function TipButton({ 
  className = "", 
  showAmountOptions = true,
  customMessage = "Support Poker Champ Development"
}: TipButtonProps) {
  const [selectedAmount, setSelectedAmount] = useState(500);
  const { trackTip, loading } = useTips();

  if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
    return null;
  }

  const handleTip = async (amountCents: number) => {
    try {
      const paymentLinkId = process.env.EXPO_PUBLIC_STRIPE_TIP_LINK_ID;
      if (!paymentLinkId) {
        Alert.alert("Error", "Tip payment link is not configured.");
        return;
      }

      await trackTip(amountCents, paymentLinkId);

      // Create Stripe Payment Link URL
      const paymentLinkUrl = `https://buy.stripe.com/${paymentLinkId}?prefilled_amount=${amountCents}`;
      
      // Open in external browser
      const supported = await Linking.canOpenURL(paymentLinkUrl);
      if (supported) {
        await Linking.openURL(paymentLinkUrl);
      } else {
        Alert.alert("Error", "Unable to open payment link. Please try again.");
      }
    } catch (error) {
      console.error("Tip error:", error);
      Alert.alert("Error", "Unable to process tip. Please try again.");
    }
  };

  const handleQuickTip = () => {
    handleTip(selectedAmount);
  };

  return (
    <View className={`gap-4 ${className}`}>
      <BaseText variant="body" className="text-center text-gray-400">
        {customMessage}
      </BaseText>
      
      {showAmountOptions && (
        <View className="flex-row justify-center gap-2">
          {TIP_AMOUNTS.map((tip) => (
            <Button
              key={tip.amount}
              title={tip.label}
              onPress={() => setSelectedAmount(tip.amount)}
              variant={selectedAmount === tip.amount ? "primary" : "ghost"}
              className="px-3 py-2"
              minWidth={60}
            />
          ))}
        </View>
      )}

      <Button
        title={`Tip $${selectedAmount / 100}`}
        onPress={handleQuickTip}
        loading={loading}
        variant="primary"
        className="w-full"
      />

      <BaseText variant="caption" className="text-center text-gray-500">
        Secure payments powered by Stripe
      </BaseText>
    </View>
  );
}
