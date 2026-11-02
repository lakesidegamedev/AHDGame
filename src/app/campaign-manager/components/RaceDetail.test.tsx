// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { RaceDetail } from "./RaceDetail";

vi.mock("@/components/elections/general/ParticipationLedgerCard", () => ({
  ParticipationLedgerCard: ({ data }: { data?: unknown }) =>
    data ? <div>participation ledger</div> : null,
}));
vi.mock("@/components/elections/general/FactorLedgerCard", () => ({
  FactorLedgerCard: ({ data }: { data?: unknown }) => (data ? <div>factor ledger</div> : null),
}));

afterEach(cleanup);

const full = (over: Partial<ElectionResponse> = {}) =>
  ({
    countryId: "US",
    allCandidates: [{ id: "a" }, { id: "b" }],
    generalVotes: {
      totalVotes: { a: 600, b: 400 },
      candidateNames: { a: "A", b: "B" },
      candidateColors: {},
      turnSnapshots: [],
    },
    ...over,
  }) as unknown as ElectionResponse;

describe("RaceDetail", () => {
  it("hides race detail when the race has none", () => {
    const { container } = renderWithElectionsMessages(
      <RaceDetail election={full({ generalVotes: null } as Partial<ElectionResponse>)} />
    );
    expect(container.textContent).toBe("");
  });

  it("shows turnout and factor ledger when present", () => {
    renderWithElectionsMessages(
      <RaceDetail
        election={full({
          regionElectorate: { count: 4000, basis: "eligible" },
          factorLedger: { turn: 3 } as never,
          generalVotes: {
            totalVotes: { a: 600, b: 400 },
            candidateNames: { a: "A", b: "B" },
            candidateColors: {},
            turnSnapshots: [{ participation: { calibrationId: "x" } }],
          } as never,
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Race detail" }));
    expect(screen.getByText("Turnout 25.0% of eligible voters (1,000 ballots)")).toBeTruthy();
    expect(screen.getByText("participation ledger")).toBeTruthy();
    expect(screen.getByText("factor ledger")).toBeTruthy();
  });
});
