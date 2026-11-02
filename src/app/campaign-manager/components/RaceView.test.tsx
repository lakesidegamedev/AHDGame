// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex } from "@/lib/campaignManager/rules";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { cand, election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { RaceView } from "./RaceView";

vi.mock("@/contexts/useGameClock", () => ({
  useGameClock: () => ({
    formatRemainingTurns: () => ({ text: "5 turns", urgency: "normal" }),
    formatRemaining: () => ({ text: "No timer", urgency: "normal" }),
    formatYear: () => null,
  }),
}));

afterEach(cleanup);

const ctx = { currentTurn: 10, nationalChamberKeys: ["senate", "house"] };
const regionNames = { OH: "Ohio", LON: "London" };

function view(e: ElectionResponse, full: ElectionResponse | null = null, over = {}) {
  const race = buildRaceIndex([e], ctx)[0];
  const onSelectCandidate = vi.fn();
  const onToggleWatch = vi.fn();
  renderWithElectionsMessages(
    <RaceView
      countryId="US"
      regionNames={regionNames}
      race={race}
      full={full}
      wire={[]}
      watched={false}
      onToggleWatch={onToggleWatch}
      selectedCandidateId={null}
      onSelectCandidate={onSelectCandidate}
      {...over}
    />
  );
  return { race, onSelectCandidate, onToggleWatch };
}

const senate = election({
  id: "s",
  endTurn: 12,
  cands: [
    { id: "a", name: "Grant Pruitt", party: "2", share: 52 },
    { id: "b", name: "Marcus Hale", party: "1", share: 48, isYou: true },
  ],
});

describe("RaceView", () => {
  it("asks for a race when none is selected", () => {
    renderWithElectionsMessages(
      <RaceView
        countryId="US"
        regionNames={regionNames}
        race={null}
        full={null}
        wire={[]}
        watched={false}
        onToggleWatch={() => {}}
        selectedCandidateId={null}
        onSelectCandidate={() => {}}
      />
    );
    expect(screen.getByText("Pick a race from the list or the map.")).toBeTruthy();
  });

  it("shows the race header with stage and turns left", () => {
    view(senate);
    expect(screen.getByRole("heading", { name: "Ohio Senate" })).toBeTruthy();
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("2 turns left")).toBeTruthy();
    expect(screen.getByText("Grant Pruitt leads by 4.0 pts")).toBeTruthy();
  });

  it("hides undecided at 100% and shows it when shares fall short", () => {
    view(senate);
    expect(screen.queryByText(/Undecided/)).toBeNull();
    cleanup();
    view(
      election({
        cands: [
          { id: "a", name: "A", party: "1", share: 50 },
          { id: "b", name: "B", party: "2", share: 46 },
        ],
      })
    );
    expect(screen.getByText("Undecided 4.0%")).toBeTruthy();
  });

  it("projects seats in a multi-seat race", () => {
    view(
      election({
        electionType: "house",
        state: "LON",
        totalSeats: 59,
        seatsEstimate: { "1": 26, "2": 20, "3": 13 },
        cands: [
          { id: "a", name: "A1", party: "1", share: 44 },
          { id: "b", name: "B1", party: "2", share: 33 },
          { id: "c", name: "C1", party: "3", share: 23 },
        ],
      })
    );
    expect(screen.getByText("59 seats", { exact: false })).toBeTruthy();
    expect(screen.getByText("Majority 30 of 59")).toBeTruthy();
    expect(
      screen.getByText(
        "P1 is the largest party, 4 short of a majority. Projected from the current vote."
      )
    ).toBeTruthy();
  });

  it("tags the player and other players and selects a candidate", () => {
    const { onSelectCandidate } = view(senate);
    expect(screen.getByText("You")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Grant Pruitt/ }));
    expect(onSelectCandidate).toHaveBeenCalledWith("a");
  });

  it("reads the change from the last two turns of polling", () => {
    const full = election({
      generalVotes: {
        turnSnapshots: [
          { turn: 8, sharesPct: { a: 50, b: 50 } },
          { turn: 9, sharesPct: { a: 52, b: 48 } },
        ],
      } as never,
    });
    view(senate, full);
    expect(screen.getByText("+2.0")).toBeTruthy();
    expect(screen.getByText("-2.0")).toBeTruthy();
  });

  it("notes a primary and its stakes", () => {
    view(
      election({
        inPrimary: true,
        inGeneral: false,
        primaryEndTurn: 13,
        byParty: [
          {
            partyId: "1",
            partyName: "Democratic",
            partyColor: "#2563eb",
            candidates: [cand({ id: "p1", name: "Pat", party: "1", share: 100 })],
          },
        ] as never,
      })
    );
    expect(
      screen.getByText(
        "Democratic primary. Only Democratic members vote. Top 1 advances to the general in 3 turns."
      )
    ).toBeTruthy();
  });
});

describe("RaceView open primary", () => {
  it("says no one has filed, and shows the header's entry control", () => {
    view(election({ id: "open-1", inPrimary: true, inGeneral: false, byParty: [] }), null, {
      entry: <button type="button">Enter race</button>,
    });
    expect(screen.getByText("The primary is open and no one has filed yet.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Enter this race" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enter race" })).toBeTruthy();
  });
});

describe("RaceView on a phone", () => {
  it("keeps name, poll and change and leaves the rest to the sheet", () => {
    view(senate, null, { compact: true });
    expect(screen.queryByText("Favor")).toBeNull();
    expect(screen.queryByText("Influence")).toBeNull();
    expect(screen.getByText("Poll")).toBeTruthy();
  });
});

describe("RaceView on a finished race", () => {
  const done = (
    over: Partial<ElectionResponse> & { cands?: Parameters<typeof election>[0]["cands"] } = {}
  ) =>
    election({
      id: "f",
      status: "resolved",
      isEnded: true,
      inGeneral: false,
      electionYear: 1988,
      cands: [
        { id: "a", name: "Grant Pruitt", party: "2", share: 52 },
        { id: "b", name: "Marcus Hale", party: "1", share: 48 },
      ],
      ...over,
    });
  const full = (votes: Record<string, number> | null) =>
    ({
      ...done(),
      generalVotes: votes ? { totalVotes: votes } : null,
    }) as unknown as ElectionResponse;

  function finalView(e: ElectionResponse, f: ElectionResponse | null) {
    const race = buildRaceIndex([e], { ...ctx, includeFinal: true })[0];
    renderWithElectionsMessages(
      <RaceView
        countryId="US"
        regionNames={regionNames}
        race={race}
        full={f}
        wire={[]}
        watched={false}
        onToggleWatch={() => {}}
        selectedCandidateId={null}
        onSelectCandidate={() => {}}
      />
    );
    return race;
  }

  it("shows a finished race as Final with its winner and vote totals", () => {
    finalView(done(), full({ a: 5200, b: 4800 }));
    expect(screen.getByText("Final")).toBeTruthy();
    expect(screen.getByText("Grant Pruitt won by 4.0 pts")).toBeTruthy();
    expect(screen.getByText("1988 Ohio Senate")).toBeTruthy();
    expect(screen.getByText("5,200")).toBeTruthy();
    expect(screen.getByText("Votes")).toBeTruthy();
    expect(screen.queryByText(/turns? left/)).toBeNull();
  });

  it("has no change column on a finished race", () => {
    finalView(done(), full({ a: 5200, b: 4800 }));
    expect(screen.queryByText("Change")).toBeNull();
  });

  it("shows candidates without totals when the race has no counted votes", () => {
    finalView(
      done({
        polling: { sharesPct: {} } as never,
        cands: [
          { id: "a", name: "Grant Pruitt", party: "2" },
          { id: "b", name: "Marcus Hale", party: "1" },
        ],
      }),
      full(null)
    );
    expect(screen.getByText("Grant Pruitt")).toBeTruthy();
    expect(screen.queryByText("Votes")).toBeNull();
    expect(screen.queryByText(/won by/)).toBeNull();
  });
});

describe("RaceView primary details", () => {
  const primary = (over: Partial<ElectionResponse> = {}) =>
    election({
      id: "pr",
      inPrimary: true,
      inGeneral: false,
      primaryAdvanceCount: 1,
      byParty: [
        {
          partyId: "1",
          partyName: "Party 1",
          partyColor: "#2563eb",
          candidates: [
            { ...cand({ id: "a", name: "Ann Lee", party: "1", share: 55 }), endorsements: [] },
            {
              ...cand({ id: "b", name: "Bo Diaz", party: "1", share: 30, isYou: true }),
              endorsements: [{ type: "npp", nppId: "7", nppName: "Sen. Roe" }],
            },
            { ...cand({ id: "c", name: "Cy Park", party: "1", share: 15 }), endorsements: [] },
          ],
        },
      ] as never,
      ...over,
    });

  it("tags the projected advancers", () => {
    view(primary());
    expect(screen.getAllByText("Projected to advance")).toHaveLength(1);
    const ann = screen.getByRole("button", { name: /Ann Lee/ });
    expect(ann.textContent).toContain("Projected to advance");
  });

  it("shows the advancing count and scoring link", () => {
    view(primary({ primaryAdvanceCount: 3 } as Partial<ElectionResponse>));
    expect(screen.getByText(/Top 3 advance to the general/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "How primary scoring works" }));
    expect(screen.getByText(/Primary share = candidate score/)).toBeTruthy();
  });

  it("shows your standing on your own primary", () => {
    view(primary());
    expect(screen.getByText("Your standing: 2 of 3, 25.0 pts behind")).toBeTruthy();
  });

  it("shows a candidate's endorsements", () => {
    view(primary());
    expect(screen.getByText("Sen. Roe")).toBeTruthy();
  });
});

describe("RaceView on an upcoming race", () => {
  it("says when it opens and lists the filers by party", () => {
    const up = election({
      id: "up",
      status: "upcoming",
      isUpcoming: true,
      inPrimary: false,
      inGeneral: false,
      startTurn: 14,
      cands: [
        { id: "a", name: "Ann Lee", party: "1" },
        { id: "b", name: "Bo Diaz", party: "2" },
      ],
    });
    const race = buildRaceIndex([up], { ...ctx, includeUpcoming: true })[0];
    renderWithElectionsMessages(
      <RaceView
        countryId="US"
        regionNames={regionNames}
        race={race}
        full={null}
        wire={[]}
        watched={false}
        onToggleWatch={() => {}}
        selectedCandidateId={null}
        onSelectCandidate={() => {}}
      />
    );
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText("Opens in 4 turns")).toBeTruthy();
    expect(screen.getByText("Party 1")).toBeTruthy();
    expect(screen.getByText("Ann Lee")).toBeTruthy();
    expect(screen.queryByText("Change")).toBeNull();
  });
});

describe("RaceView seat results", () => {
  it("labels a finished multi-seat race's seats as won", () => {
    const done = election({
      id: "lon",
      electionType: "commons",
      state: "LON",
      countryId: "UK",
      status: "resolved",
      isEnded: true,
      inGeneral: false,
      totalSeats: 10,
      seatsEstimate: { "1": 6, "2": 4 },
      cands: [
        { id: "a", name: "Lab A", party: "1", share: 55 },
        { id: "b", name: "Con B", party: "2", share: 45 },
      ],
    });
    const race = buildRaceIndex([done], { ...ctx, includeFinal: true })[0];
    renderWithElectionsMessages(
      <RaceView
        countryId="UK"
        regionNames={regionNames}
        race={race}
        full={null}
        wire={[]}
        watched={false}
        onToggleWatch={() => {}}
        selectedCandidateId={null}
        onSelectCandidate={() => {}}
      />
    );
    expect(screen.getByText("Seats won")).toBeTruthy();
    expect(screen.queryByText("Projected seats")).toBeNull();
    expect(screen.getByText(/won a majority \(6\)/)).toBeTruthy();
  });
});
