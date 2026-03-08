/** Mock for vitest - react-native uses Flow import typeof which rollup cannot parse */
export const Platform = { OS: "web" as const };
export const StyleSheet = {
  create: <T extends Record<string, object>>(styles: T): T => styles,
};
export const View = "View";
export const Text = "Text";
export default { Platform, StyleSheet, View, Text };
