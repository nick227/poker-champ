/** Mock for vitest - react-native-mmkv native module is not available in test env */
import { vi } from "vitest";

const backing = new Map<string, string>();

const mockStore = {
  getString: vi.fn((key: string) => backing.get(key)),
  set: vi.fn((key: string, value: string) => {
    backing.set(key, value);
  }),
  remove: vi.fn((key: string) => {
    backing.delete(key);
  }),
  delete: vi.fn((key: string) => {
    backing.delete(key);
  }),
};

export function createMMKV(_options?: { id?: string }) {
  return mockStore;
}

/** Test-only helper: clears in-memory storage between tests. */
export function __resetMockMMKVForTests(): void {
  backing.clear();
  mockStore.getString.mockClear();
  mockStore.set.mockClear();
  mockStore.remove.mockClear();
  mockStore.delete.mockClear();
}
