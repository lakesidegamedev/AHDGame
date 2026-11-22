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
  fetchMock = vi.fn(async (url: string) =>
    String(url).endsWith("/entry-preview")
      ? new Response(JSON.stringify({ checks: [] }))
      : new Response(JSON.stringify({ message: "Done" }))
  );
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
    expect(fetchMock).not.toHaveBeenCalledWith("/api/elections/e1/enter", expect.anything());
  });

  it("disables confirm with the reason when a hard check fails", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            checks: [
              {
                id: "homeState",
                label: "Lives in this region",
                status: "fail",
                reason: "Wrong state.",
              },
            ],
          })
        )
    );
    const confirm = vi.fn(async () => false);
    const { result } = renderHook(() => useRaceEntry(election, { onDone: vi.fn(), confirm }));
    await act(() => result.current.enter());
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmDisabledReason: "Wrong state." })
    );
  });

  it("still confirms when the preview cannot load", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    const confirm = vi.fn(async () => false);
    const { result } = renderHook(() => useRaceEntry(election, { onDone: vi.fn(), confirm }));
    await act(() => result.current.enter());
    const arg = (confirm.mock.calls[0] as unknown[])[0] as { confirmDisabledReason?: string };
    expect(arg.confirmDisabledReason).toBeUndefined();
  });

  it("sends the chosen constituency", async () => {
    const hu = { ...election, countryId: "HU", hungarianAssemblyRound: { round: 1 } };
    const { result } = renderHook(() =>
      useRaceEntry(hu, { onDone: vi.fn(), confirm: async () => true, constituencyId: "HU-01" })
    );
    await act(() => result.current.enter());
    expect(fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/enter"))?.[1]).toMatchObject({
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
