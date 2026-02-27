/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJoiningTableState } from "@/hooks/useJoiningTableState";

describe("useJoiningTableState timeout reset", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears joiningTableId when join does not resolve before timeout", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useJoiningTableState(1000));

    act(() => {
      result.current.beginJoining("table_1");
    });
    expect(result.current.joiningTableId).toBe("table_1");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.joiningTableId).toBeNull();
  });

  it("replaces the previous timer when joining a different table", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useJoiningTableState(1000));

    act(() => {
      result.current.beginJoining("table_a");
    });
    expect(result.current.joiningTableId).toBe("table_a");

    act(() => {
      vi.advanceTimersByTime(500);
      result.current.beginJoining("table_b");
    });
    expect(result.current.joiningTableId).toBe("table_b");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.joiningTableId).toBe("table_b");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.joiningTableId).toBeNull();
  });
});
