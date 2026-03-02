import { create } from "zustand";
import type { Profile } from "@/lib/profileFromMe";

type ProfileState = {
  profile: Profile;
  setProfile: (p: Profile) => void;
};

export const useProfileStore = create<ProfileState>((set) => ({
  profile: {},
  setProfile: (profile) => set({ profile }),
}));
