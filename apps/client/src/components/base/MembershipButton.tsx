import { useState } from "react";
import { Alert, Linking } from "react-native";
import { request } from "@poker-champ/sdk";
import { Button } from "./Button";
import { MONETIZATION_FEATURES } from "@/config/features";

interface MembershipButtonProps {
  className?: string;
  variant?: "primary" | "ghost";
  showPrice?: boolean;
  customMessage?: string;
}

export function MembershipButton({ 
  className = "", 
  variant = "primary",
  showPrice = true,
  customMessage = "Get Lifetime Access"
}: MembershipButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
    return null;
  }

  const handlePurchase = async () => {
    setLoading(true);

    try {
      const result = await request<{ success: boolean; url?: string; error?: string }>(
        "POST",
        "/api/monetization/memberships/checkout"
      );

      if (result.success && result.url) {
        // Open Stripe Checkout in external browser
        const supported = await Linking.canOpenURL(result.url);
        if (supported) {
          await Linking.openURL(result.url);
        } else {
          Alert.alert("Error", "Unable to open payment page. Please try again.");
        }
      } else {
        Alert.alert("Error", result.error || "Unable to process membership purchase.");
      }
    } catch (error) {
      console.error("Membership purchase error:", error);
      Alert.alert("Error", "Unable to process membership purchase. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const buttonText = showPrice 
    ? `Get Lifetime Access - $${MONETIZATION_FEATURES.PREMIUM_PRICE}`
    : customMessage;

  return (
    <Button
      title={buttonText}
      onPress={handlePurchase}
      loading={loading}
      variant={variant}
      className={className}
    />
  );
}
