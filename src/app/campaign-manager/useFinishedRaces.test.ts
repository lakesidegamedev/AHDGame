// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFinishedCount, useFinishedRaces } from "./useFinishedRaces";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ elections: [], total: 7 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const keys: string[] = [];

describe("useFinishedRaces", () => {
  it("loads nothing until the Finished stage asks", () => {
    renderHook(() => useFinishedRaces("US", "senate-off", false, keys, 1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reloads on a new turn, so a race that just ended appears", async () => {
    const { rerender } = renderHook(
      ({ turn }) => useFinishedRaces("US", "senate-turns", true, keys, turn),
      { initialProps: { turn: 1 } }
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ turn: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain("status=completed,resolved");
  });
});

describe("useFinishedCount", () => {
  it("counts a type's finished races with a one-row read", async () => {
    const { result } = renderHook(() => useFinishedCount("US", "senate-count", 1));
    await waitFor(() => expect(result.current).toBe(7));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("limit=1");
    expect(url).toContain("type=senate-count");
  });
});
