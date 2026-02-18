import { create } from "zustand";
import type { HandHistoryListItem, HandHistoryDetail } from "@/services/history.service";

type HistoryState = {
  // Hand list state
  hands: HandHistoryListItem[];
  cursor: string | null;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  
  // Hand detail state
  selectedHand: HandHistoryDetail | null;
  isLoadingDetail: boolean;
  detailError: string | null;
  
  // Actions
  setHands: (hands: HandHistoryListItem[]) => void;
  appendHands: (hands: HandHistoryListItem[]) => void;
  setCursor: (cursor: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  setError: (error: string | null) => void;
  
  setSelectedHand: (hand: HandHistoryDetail | null) => void;
  setIsLoadingDetail: (loading: boolean) => void;
  setDetailError: (error: string | null) => void;
  
  // Reset actions
  resetHandList: () => void;
  resetDetail: () => void;
  resetAll: () => void;
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  // Initial state
  hands: [],
  cursor: null,
  isLoading: false,
  hasMore: true,
  error: null,
  
  selectedHand: null,
  isLoadingDetail: false,
  detailError: null,
  
  // Hand list actions
  setHands: (hands) => set({ hands }),
  appendHands: (newHands) => set((state) => ({ 
    hands: [...state.hands, ...newHands] 
  })),
  setCursor: (cursor) => set({ cursor }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  setError: (error) => set({ error }),
  
  // Hand detail actions
  setSelectedHand: (selectedHand) => set({ selectedHand }),
  setIsLoadingDetail: (isLoadingDetail) => set({ isLoadingDetail }),
  setDetailError: (detailError) => set({ detailError }),
  
  // Reset actions
  resetHandList: () => set({
    hands: [],
    cursor: null,
    isLoading: false,
    hasMore: true,
    error: null,
  }),
  
  resetDetail: () => set({
    selectedHand: null,
    isLoadingDetail: false,
    detailError: null,
  }),
  
  resetAll: () => set({
    hands: [],
    cursor: null,
    isLoading: false,
    hasMore: true,
    error: null,
    selectedHand: null,
    isLoadingDetail: false,
    detailError: null,
  }),
}));
