const globalScope = globalThis as Record<string, unknown>;

if (globalScope.__reanimatedLoggerConfig == null) {
  globalScope.__reanimatedLoggerConfig = {
    logFunction: () => {},
    level: 1,
    strict: false,
  };
}
