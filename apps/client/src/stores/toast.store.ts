import { create } from "zustand";

type ToastState = {
  message: string | null;
  variant: "default" | "success" | "danger";
  show: (message: string, variant?: "default" | "success" | "danger") => void;
  dismiss: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "default",
  show: (message, variant = "default") => set({ message, variant }),
  dismiss: () => set({ message: null }),
}));
