// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex, type RaceFilter } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { RaceFinder } from "./RaceFinder";

afterEach(cleanup);

const regionNames = { OH: "Ohio", PA: "Pennsylvania", MI: "Michigan" };
const races = buildRaceIndex(
  [
    election({
      id: "s-oh",
      state: "OH",
      senateClass: 2,
      cands: [
        { id: "a", name: "Grant Pruitt", party: "1", share: 51 },
        { id: "b", name: "Ivy Lind", party: "2", share: 44 },
      ],
    }),
    election({
      id: "s-pa",
      state: "PA",
      cands: [
        { id: "c", name: "Cora", party: "1", share: 60 },
        { id: "d", name: "Dov", party: "2", share: 40 },
      ],
    }),
    election({
      id: "g-oh",
      electionType: "governor",
      state: "OH",
      inPrimary: true,
      inGeneral: false,
      byParty: [
        {
          partyId: "1",
          partyName: "Party 1",
          partyColor: "#2563eb",
          candidates: [],
        },
      ] as never,
    }),
  ],
  { currentTurn: 10, nationalChamberKeys: ["senate", "house"] }
);

function renderFinder(over: Partial<RaceFilter> = {}) {
  const onFilter = vi.fn();
  const onSelect = vi.fn();
  const onToggleWatch = vi.fn();
  const filter: RaceFilter = {
    type: "senate",
    stage: "all",
    regionId: "ALL",
    query: "",
    regionNames,
    ...over,
  };
  renderWithElectionsMessages(
    <RaceFinder
      countryId="US"
      races={races}
      filter={filter}
      onFilter={onFilter}
      selectedKey={null}
      onSelect={onSelect}
      watched={new Set()}
      onToggleWatch={onToggleWatch}
      regionNoun="State"
      regionNounPlural="States"
    />
  );
  return { onFilter, onSelect, onToggleWatch };
}

describe("RaceFinder", () => {
  it("groups race types under National and Regional with live counts", () => {
    renderFinder();
    const national = screen.getByRole("group", { name: "National races" });
    const regional = screen.getByRole("group", { name: "Regional races" });
    expect(within(national).getByRole("button", { name: /Senate\s*2/ })).toBeTruthy();
    expect(within(regional).getByRole("button", { name: /Governor\s*1/ })).toBeTruthy();
  });

  it("counts each stage for the chosen type and switches stage", () => {
    const { onFilter } = renderFinder();
    const stage = screen.getByRole("group", { name: "Election stage" });
    expect(within(stage).getByRole("button", { name: /General\s*2/ })).toBeTruthy();
    expect(within(stage).getByRole("button", { name: /Primary\s*0/ })).toBeTruthy();
    fireEvent.click(within(stage).getByRole("button", { name: /Primary/ }));
    expect(onFilter).toHaveBeenCalledWith({ stage: "primary" });
  });

  it("narrows to a region and says how many races are there", () => {
    renderFinder({ regionId: "OH" });
    expect(screen.getByText("1 race in Ohio")).toBeTruthy();
    expect(screen.queryByText(/Pennsylvania Senate/)).toBeNull();
  });

  it("labels a Senate class and the leader", () => {
    renderFinder();
    expect(screen.getByText("Class 2")).toBeTruthy();
    expect(screen.getByText("Grant Pruitt leads Ivy Lind")).toBeTruthy();
  });

  it("shows the empty copy when nothing matches", () => {
    renderFinder({ query: "nobody" });
    expect(screen.getByText("No races match. Clear the search.")).toBeTruthy();
  });

  it("toggles a watched race and selects a race", () => {
    const { onToggleWatch, onSelect } = renderFinder();
    fireEvent.click(screen.getByRole("button", { name: "Watch Ohio Senate" }));
    expect(onToggleWatch).toHaveBeenCalledWith("s-oh");
    fireEvent.click(screen.getByRole("button", { name: /^Ohio Senate/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "s-oh" }));
  });
});

describe("RaceFinder Finished stage", () => {
  const finishedRaces = buildRaceIndex(
    [
      election({
        id: "s-oh",
        state: "OH",
        cands: [{ id: "a", name: "Grant Pruitt", party: "1", share: 51 }],
        primaryResults: {
          "1": [{ candidateId: "a", characterName: "Grant Pruitt", sharePct: 100, won: true }],
        },
      }),
      ...[1988, 1994].map((year) =>
        election({
          id: `old-${year}`,
          state: "PA",
          status: "resolved",
          isEnded: true,
          inGeneral: false,
          electionYear: year,
          cands: [{ id: "c", name: "Cora", party: "1", share: 60 }],
        })
      ),
    ],
    { currentTurn: 10, nationalChamberKeys: ["senate"], includeFinal: true }
  );
  function renderWith(over: Partial<RaceFilter>) {
    const onFilter = vi.fn();
    renderWithElectionsMessages(
      <RaceFinder
        countryId="US"
        races={finishedRaces}
        filter={{ type: "senate", stage: "all", regionId: "ALL", query: "", regionNames, ...over }}
        onFilter={onFilter}
        selectedKey={null}
        onSelect={() => {}}
        watched={new Set()}
        onToggleWatch={() => {}}
        regionNoun="State"
        regionNounPlural="States"
      />
    );
    return onFilter;
  }

  it("counts live races under All and finished races under Finished", () => {
    renderWith({});
    const stage = screen.getByRole("group", { name: "Election stage" });
    expect(within(stage).getByRole("button", { name: /All\s*1/ })).toBeTruthy();
    expect(within(stage).getByRole("button", { name: /Finished\s*2/ })).toBeTruthy();
  });

  it("shows a year picker only on Finished", () => {
    renderWith({});
    expect(screen.queryByRole("combobox", { name: "Election year" })).toBeNull();
    cleanup();
    const onFilter = renderWith({ stage: "final", year: 1994 });
    const year = screen.getByRole("combobox", { name: "Election year" }) as HTMLSelectElement;
    expect([...year.options].map((o) => o.value)).toEqual(["1994", "1988"]);
    fireEvent.change(year, { target: { value: "1988" } });
    expect(onFilter).toHaveBeenCalledWith({ year: 1988 });
    expect(screen.getByText("1 race nationwide")).toBeTruthy();
  });

  it("says so when a type has no finished races", () => {
    renderWith({ type: "governor", stage: "final", year: null });
    expect(screen.getByText("No finished races yet.")).toBeTruthy();
  });
});
