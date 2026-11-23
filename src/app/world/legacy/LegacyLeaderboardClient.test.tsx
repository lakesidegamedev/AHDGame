/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LegacyLeaderboardClient from "./LegacyLeaderboardClient";
import type { LegacyLeaderboardData, LegacyLeaderboardEntry } from "@/lib/world/legacyLeaderboard";

let resolveFetch: (value: LegacyLeaderboardData) => void = () => {};
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: () =>
    new Promise<LegacyLeaderboardData>((resolve) => {
      resolveFetch = resolve;
    }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

function entry(over: Partial<LegacyLeaderboardEntry>): LegacyLeaderboardEntry {
  return {
    rank: 1,
    userId: "u1",
    displayName: "Alpha",
    scoringCharacterName: "Alpha",
    scoringIsActive: true,
    countryId: "US",
    iterationLabel: "Iteration 1",
    score: 500,
    netWorth: 1_000_000,
    nationalInfluence: 10,
    partyInfluence: 5,
    achievementCount: 3,
    highestOffice: null,
    lifetimeLives: 2,
    ...over,
  } as LegacyLeaderboardEntry;
}

describe("LegacyLeaderboardClient ranking switch", () => {
  it("keeps the career columns until net worth rows arrive", async () => {
    const legacy = {
      entries: [entry({})],
      total: 1,
      self: null,
    } as unknown as LegacyLeaderboardData;
    render(
      <LegacyLeaderboardClient
        data={legacy}
        total={1}
        selfUserId={null}
        initialScope="all"
        initialRankBy="legacy"
        embedded
      />
    );
    expect(screen.getAllByText("Career score").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Net worth" }));
    // Rows are still the career-sorted ones, so the column must not relabel yet.
    expect(screen.queryByText("Richest ever")).toBeNull();

    resolveFetch({
      entries: [entry({ userId: "u2", displayName: "Rich", netWorth: 9_000_000_000 })],
      total: 1,
      self: null,
    } as unknown as LegacyLeaderboardData);
    await waitFor(() => expect(screen.getByText("Richest ever")).toBeTruthy());
    expect(screen.getAllByText("Rich").length).toBeGreaterThan(0);
  });

  it("defines Lives in place", () => {
    render(
      <LegacyLeaderboardClient
        data={{ entries: [entry({})], total: 1, self: null } as unknown as LegacyLeaderboardData}
        total={1}
        selfUserId={null}
        initialScope="all"
        initialRankBy="legacy"
        embedded
      />
    );
    expect(
      screen.getAllByTitle(/A life is one character this player has created/).length
    ).toBeGreaterThan(0);
  });
});
