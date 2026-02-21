/**
 * 🎯 REPLAY CONTROLLER
 * 
 * Thin replay controls that sit next to TableProvider
 * No parallel abstractions - just sugar on top
 */

import type { TableProvider } from "@/types/tableProvider";

export interface ReplayController {
  /** Current step in replay */
  currentStep: number;
  
  /** Total available steps */
  totalSteps: number;
  
  /** Navigation methods */
  next: () => void;
  prev: () => void;
  goTo: (step: number) => void;
  
  /** Playback controls */
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  
  /** Playback state */
  isPlaying: boolean;
  speed: number;
}

/**
 * 🎯 REPLAY TABLE PROVIDER
 * 
 * TableProvider with replay controls attached
 * Same contract, different snapshot source
 */
export interface ReplayTableProvider extends TableProvider {
  /** Replay controls */
  replay: ReplayController;
}

/**
 * 🎯 REPLAY SOURCE TYPES
 * 
 * Different sources of snapshot data
 */
export type ReplaySource = 
  | "HAND_HISTORY"
  | "LESSON" 
  | "COACHING"
  | "ANALYSIS"
  | "GHOST_TABLE";
