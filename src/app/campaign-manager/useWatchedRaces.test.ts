// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWatchedRaces } from "./useWatchedRaces";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useWatchedRaces", () => {
  it("remembers a watched race for the character across remounts", () => {
    const first = renderHook(() => useWatchedRaces("c1"));
    act(() => first.result.current.toggle("e1"));
    expect(first.result.current.watched.has("e1")).toBe(true);
    first.unmount();
    const again = renderHook(() => useWatchedRaces("c1"));
    expect(again.result.current.watched.has("e1")).toBe(true);
    act(() => again.result.current.toggle("e1"));
    expect(again.result.current.watched.has("e1")).toBe(false);
  });

  it("keeps each character's watchlist apart", () => {
    const a = renderHook(() => useWatchedRaces("c1"));
    act(() => a.result.current.toggle("e1"));
    const b = renderHook(() => useWatchedRaces("c2"));
    expect(b.result.current.watched.size).toBe(0);
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useWatchedRaces("c1"));
    expect(result.current.watched.size).toBe(0);
    act(() => result.current.toggle("e1"));
    expect(result.current.watched.has("e1")).toBe(true);
  });
});
