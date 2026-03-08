/** Mock for vitest - react-native-mmkv native module is not available in test env */

const mockStore = {
  getString: () => undefined as string | undefined,
  set: () => {},
  remove: () => {},
  delete: () => {},
};

export function createMMKV(_options?: { id?: string }) {
  return mockStore;
}
