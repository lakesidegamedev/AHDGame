/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSharePriceHistory } from "./useSharePriceHistory";

afterEach(() => vi.unstubAllGlobals());

function stubHistory(points: { turn: number; sharePrice: number }[]) {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ history: points })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useSharePriceHistory", () => {
  it("refetches with the new turn so the change basis follows the live price", async () => {
    const fetchMock = stubHistory([
      { turn: 1, sharePrice: 5 },
      { turn: 2, sharePrice: 6 },
    ]);
    const { rerender, result } = renderHook(
      ({ turn }: { turn: number }) => useSharePriceHistory("c1", true, turn),
      { initialProps: { turn: 2 } }
    );
    await waitFor(() => expect(result.current.dayChange?.prevClose).toBe(5));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/corporations/c1/history?sparkline=1&turn=2");

    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            history: [
              { turn: 2, sharePrice: 6 },
              { turn: 3, sharePrice: 6.5 },
            ],
          })
        )
    );
    rerender({ turn: 3 });
    await waitFor(() => expect(result.current.dayChange?.prevClose).toBe(6));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/corporations/c1/history?sparkline=1&turn=3");
  });
});
