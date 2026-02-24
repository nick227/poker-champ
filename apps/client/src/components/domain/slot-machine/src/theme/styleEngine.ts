import { StyleSheet } from "react-native";
import type { Theme } from "./types";

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  theme: Theme,
  factory: (t: Theme) => T
) {
  return StyleSheet.create(factory(theme));
}
