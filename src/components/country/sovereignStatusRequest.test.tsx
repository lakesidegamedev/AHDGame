/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SovereignCrisisDecisionPanel } from "./SovereignCrisisDecisionPanel";
import { SovereignRecoveryProgressPanel } from "./SovereignRecoveryProgressPanel";
import { BondMarketDemandWidget } from "./BondMarketDemandWidget";
import { clearSovereignStatusCache, fetchSovereignStatus } from "./sovereignStatusRequest";

/** The three panels the country page stacks under "Sovereign debt". */
function SovereignPanels() {
  return (
    <div>
      <SovereignCrisisDecisionPanel countryCode="US" />
      <SovereignRecoveryProgressPanel countryCode="US" />
      <BondMarketDemandWidget countryCode="US" />
    </div>
  );
}

function payload() {
  return {
    countryCode: "US",
    currentTurn: 12,
    crisisState: "recovering",
    recoveryStartedAt: { turn: 4 },
    recoveryFiscalDisciplineStreak: 2,
    marketAccessLockedUntilTurn: null,
    recoveryGdpPenaltyPercent: null,
    recoveryGdpPenaltyTurnsRemaining: null,
    imfSovereignBailoutActive: false,
    demand: { demandRatio: 1.1, components: [] },
    snapshot: { inflationRate: 0.02 },
  };
}

beforeEach(() => {
  clearSovereignStatusCache();
});

afterEach(() => {
  cleanup();
  clearSovereignStatusCache();
  vi.unstubAllGlobals();
});

describe("country sovereign status", () => {
  it("makes one request for all three panels, not one each", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) => new Response(JSON.stringify(payload()), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SovereignPanels />);

    // Every panel still renders its own content from the shared answer.
    expect(await screen.findByText("Sovereign recovery — In progress")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1.10")).toBeTruthy());

    const sovereignCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/sovereign-status")
    );
    expect(sovereignCalls).toHaveLength(1);
    expect(String(sovereignCalls[0][0])).toBe("/api/country/US/sovereign-status");
  });

  it("keeps the payload for a panel that mounts a moment later", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) => new Response(JSON.stringify(payload()), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<BondMarketDemandWidget countryCode="US" />);
    await waitFor(() => expect(screen.getByText("1.10")).toBeTruthy());
    first.unmount();

    render(<SovereignRecoveryProgressPanel countryCode="US" />);
    expect(await screen.findByText("Sovereign recovery — In progress")).toBeTruthy();

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/sovereign-status"))
    ).toHaveLength(1);
  });

  it("reports a failed read as no payload, so each panel keeps its own empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );

    const result = await fetchSovereignStatus("US");

    expect(result).toEqual({ ok: false, data: null, error: null });
  });

  it("reports a transport failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))
    );

    const result = await fetchSovereignStatus("US");

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe("Failed to fetch");
  });

  it("asks per country rather than serving another country's answer", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) => new Response(JSON.stringify(payload()), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSovereignStatus("US");
    await fetchSovereignStatus("UK");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
