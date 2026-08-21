/**
 * Mock for vitest - the real `nativewind` package resolves to
 * react-native-css-interop's web runtime, which ships unbuilt TypeScript
 * source. Vitest only transforms node_modules listed in
 * server.deps.inline, so importing it directly throws a syntax error.
 * `vars()` just needs to produce a spreadable style object for tests.
 */
export function vars(cssVariables: Record<string, string>): Record<string, string> {
  return cssVariables;
}
