/**
 * Single source of easing for table FX. Use these everywhere so animations
 * feel consistent and intentional (no ad-hoc Easing.ease / mixed curves).
 */
import { Easing } from "react-native";

/** Opacity in: quick settle so the effect reads. */
export const EASING_OPACITY_IN = Easing.out(Easing.cubic);

/** Opacity out: gentle decay so the tail doesn't cut abruptly. */
export const EASING_OPACITY_OUT = Easing.in(Easing.cubic);

/** Scale / position: smooth arrive (expand, move). */
export const EASING_SCALE = Easing.out(Easing.cubic);

/** Softer opacity in for ambient layers (streak, seat glow). */
export const EASING_OPACITY_IN_SOFT = Easing.out(Easing.quad);
