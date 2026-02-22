/** Mock for vitest - react-native uses Flow import typeof which rollup cannot parse */
export const Platform = { OS: "web" as const };
export default { Platform };
