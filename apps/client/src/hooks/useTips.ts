import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { request } from '@poker-champ/sdk';
import { MONETIZATION_FEATURES } from '@/config/features';

interface TipHistoryItem {
  id: string;
  amount: number;
  date: Date;
  metadata?: unknown;
}

interface UseTipsOptions {
  userId?: string;
}

export function useTips(options: UseTipsOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [tipHistory, setTipHistory] = useState<TipHistoryItem[]>([]);

  const trackTip = useCallback(async (amountCents: number, paymentLinkId?: string) => {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      Alert.alert('Tips Disabled', 'Tip functionality is currently disabled');
      return { success: false };
    }

    setLoading(true);

    try {
      const result = await request<{ transactionId?: string }>(
        "POST",
        "/api/monetization/tips/track",
        { amountCents, stripePaymentLinkId: paymentLinkId }
      );
      return { success: true, transactionId: result.transactionId };
    } catch (error) {
      console.error('Tip tracking error:', error);
      Alert.alert('Error', 'Unable to track tip. Please try again.');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTipHistory = useCallback(async () => {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      setTipHistory([]);
      return;
    }

    setLoading(true);

    try {
      const data = await request<{ tips: { id: string; amount: number; date: string; metadata?: unknown }[] }>(
        "GET",
        "/api/monetization/tips/history"
      );
      setTipHistory(
        data.tips.map((tip) => ({ ...tip, date: new Date(tip.date) }))
      );
    } catch (error) {
      console.error('Tip history error:', error);
      Alert.alert('Error', 'Unable to fetch tip history.');
    } finally {
      setLoading(false);
    }
  }, []);

  const getTotalTips = useCallback(() => {
    return tipHistory.reduce((total, tip) => total + tip.amount, 0);
  }, [tipHistory]);

  const getTipCount = useCallback(() => {
    return tipHistory.length;
  }, [tipHistory]);

  return {
    loading,
    tipHistory,
    trackTip,
    fetchTipHistory,
    getTotalTips,
    getTipCount,
    isTipsEnabled: MONETIZATION_FEATURES.TIPS_ENABLED,
  };
}
