// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const showToast = vi.fn();
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));

import { useRaceEntry, type RaceEntryElection } from "./useRaceEntry";

const election: RaceEntryElection = {
  id: "e1",
  countryId: "US",
  electionType: "senate",
  state: "OH",
  inPrimary: true,
  isEnded: false,
  myCharId: "c1",
  viewerWithdrew: false,
  allCandidates: [{ isYou: false }],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  showToast.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Done" })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useRaceEntry", () => {
  it("enters after confirmation and reports back", async () => {
    const onDone = vi.fn();
    const confirm = vi.fn(async () => true);
    const { result } = renderHook(() => useRaceEntry(election, { onDone, confirm }));
    expect(result.current.canEnter).toBe(true);
    await act(() => result.current.enter());
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Enter race" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/elections/e1/enter", { method: "POST" });
    expect(showToast).toHaveBeenCalledWith("Done", "success");
    expect(onDone).toHaveBeenCalled();
  });

  it("does nothing when the player cancels", async () => {
    const { result } = renderHook(() =>
      useRaceEntry(election, { onDone: vi.fn(), confirm: async () => false })
    );
    await act(() => result.current.enter());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the chosen constituency", async () => {
    const hu = { ...election, countryId: "HU", hungarianAssemblyRound: { round: 1 } };
    const { result } = renderHook(() =>
      useRaceEntry(hu, { onDone: vi.fn(), confirm: async () => true, constituencyId: "HU-01" })
    );
    await act(() => result.current.enter());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ constituencyId: "HU-01" }),
    });
  });

  it("withdraws with a destructive confirmation", async () => {
    const mine = { ...election, allCandidates: [{ isYou: true }] };
    const confirm = vi.fn(async () => true);
    const { result } = renderHook(() => useRaceEntry(mine, { onDone: vi.fn(), confirm }));
    expect(result.current.canWithdraw).toBe(true);
    await act(() => result.current.withdraw());
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(fetchMock).toHaveBeenCalledWith("/api/elections/e1/withdraw", { method: "POST" });
  });
});
