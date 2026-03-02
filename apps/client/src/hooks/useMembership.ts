import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { request } from '@poker-champ/sdk';
import { MONETIZATION_FEATURES } from '@/config/features';

interface MembershipData {
  id: string;
  userId: string;
  type: string;
  status: string;
  purchasedAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    displayName: string;
    email: string;
  };
}

interface UseMembershipOptions {
  autoFetch?: boolean;
}

export function useMembership(options: UseMembershipOptions = { autoFetch: true }) {
  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MembershipData | null>(null);

  const fetchMembershipStatus = useCallback(async () => {
    if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
      setMembership(null);
      return;
    }

    setLoading(true);

    try {
      const data = await request<{ membership: MembershipData | null }>(
        "GET",
        "/api/monetization/memberships/status"
      );
      setMembership(data.membership);
    } catch (error) {
      console.error('Membership status error:', error);
      // Don't show alert for membership status errors - just log it
    } finally {
      setLoading(false);
    }
  }, []);

  const createCheckoutSession = useCallback(async () => {
    if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
      Alert.alert('Memberships Disabled', 'Membership purchases are currently disabled');
      return { success: false };
    }

    setLoading(true);

    try {
      return await request<{ success: boolean; url?: string; error?: string }>(
        "POST",
        "/api/monetization/memberships/checkout"
      );
    } catch (error) {
      console.error('Checkout session error:', error);
      Alert.alert('Error', 'Unable to create checkout session. Please try again.');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const isLifetimeMember = useCallback(() => {
    return membership?.type === 'lifetime' && membership?.status === 'active';
  }, [membership]);

  const isPremiumMember = useCallback(() => {
    return membership?.status === 'active';
  }, [membership]);

  const hasAccessToPremium = useCallback(() => {
    if (!MONETIZATION_FEATURES.PAY_GATING_ENABLED) {
      return true; // If pay gating is disabled, everyone has access
    }
    return isPremiumMember();
  }, [isPremiumMember]);

  const getMembershipDisplay = useCallback(() => {
    if (!membership) {
      return { status: 'Free Account', color: 'text-gray-400' };
    }

    const isActive = membership.status === 'active';
    const isLifetime = membership.type === 'lifetime';

    if (isLifetime && isActive) {
      return { status: 'Lifetime Member', color: 'text-green-400' };
    } else if (isActive) {
      return { status: 'Premium Member', color: 'text-blue-400' };
    } else {
      return { status: 'Expired', color: 'text-red-400' };
    }
  }, [membership]);

  const getPurchasedDate = useCallback(() => {
    return membership?.purchasedAt ? new Date(membership.purchasedAt) : null;
  }, [membership]);

  const getExpirationDate = useCallback(() => {
    return membership?.expiresAt ? new Date(membership.expiresAt) : null;
  }, [membership]);

  // Auto-fetch membership status on mount if enabled
  useEffect(() => {
    if (options.autoFetch) {
      fetchMembershipStatus();
    }
  }, [fetchMembershipStatus, options.autoFetch]);

  return {
    loading,
    membership,
    fetchMembershipStatus,
    createCheckoutSession,
    isLifetimeMember,
    isPremiumMember,
    hasAccessToPremium,
    getMembershipDisplay,
    getPurchasedDate,
    getExpirationDate,
    isMembershipEnabled: MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED,
    isPayGatingEnabled: MONETIZATION_FEATURES.PAY_GATING_ENABLED,
  };
}
