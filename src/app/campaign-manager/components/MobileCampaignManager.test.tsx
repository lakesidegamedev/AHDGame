// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex, type RaceFilter } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { BottomSheet, MobileRaceStrip, MobileTabs } from "./MobileCampaignManager";

afterEach(cleanup);

const races = buildRaceIndex(
  [
    election({
      id: "s-oh",
      state: "OH",
      cands: [
        { id: "a", name: "A", party: "1", share: 52 },
        { id: "b", name: "B", party: "2", share: 48 },
      ],
    }),
    election({
      id: "s-pa",
      state: "PA",
      cands: [
        { id: "c", name: "C", party: "1", share: 70 },
        { id: "d", name: "D", party: "2", share: 30 },
      ],
    }),
  ],
  { currentTurn: 10, nationalChamberKeys: ["senate"] }
);
const filter: RaceFilter = {
  type: "senate",
  stage: "all",
  regionId: "ALL",
  query: "",
  regionNames: { OH: "Ohio", PA: "Pennsylvania" },
};

describe("MobileTabs", () => {
  it("swaps between Races and My moves", () => {
    const onTab = vi.fn();
    renderWithElectionsMessages(<MobileTabs tab="races" onTab={onTab} />);
    expect(screen.getByRole("tab", { name: "Races" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "My moves" }));
    expect(onTab).toHaveBeenCalledWith("self");
  });
});

describe("MobileRaceStrip", () => {
  it("lists races as chips and selects one", () => {
    const onSelect = vi.fn();
    renderWithElectionsMessages(
      <MobileRaceStrip
        countryId="US"
        races={races}
        filter={filter}
        onFilter={() => {}}
        selectedKey={null}
        onSelect={onSelect}
        watched={new Set()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Ohio Senate/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "s-oh" }));
  });

  it("switches race type and stage", () => {
    const onFilter = vi.fn();
    renderWithElectionsMessages(
      <MobileRaceStrip
        countryId="US"
        races={races}
        filter={filter}
        onFilter={onFilter}
        selectedKey={null}
        onSelect={() => {}}
        watched={new Set()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /General/ }));
    expect(onFilter).toHaveBeenCalledWith({ stage: "general" });
  });
});

describe("BottomSheet", () => {
  it("shows its content and closes", () => {
    const onClose = vi.fn();
    renderWithElectionsMessages(
      <BottomSheet title="Grant Pruitt" onClose={onClose}>
        <p>Target actions</p>
      </BottomSheet>
    );
    expect(screen.getByRole("dialog", { name: "Grant Pruitt" })).toBeTruthy();
    expect(screen.getByText("Target actions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("MobileRaceStrip Finished stage", () => {
  it("offers Finished and a year picker on it", () => {
    const done = buildRaceIndex(
      [
        election({
          id: "old",
          state: "OH",
          status: "resolved",
          isEnded: true,
          inGeneral: false,
          electionYear: 1988,
          cands: [{ id: "a", name: "A", party: "1", share: 60 }],
        }),
      ],
      { currentTurn: 10, nationalChamberKeys: ["senate"], includeFinal: true }
    );
    const onFilter = vi.fn();
    renderWithElectionsMessages(
      <MobileRaceStrip
        countryId="US"
        races={[...races, ...done]}
        filter={{ ...filter, stage: "final", year: 1988 }}
        onFilter={onFilter}
        selectedKey={null}
        onSelect={() => {}}
        watched={new Set()}
      />
    );
    expect(screen.getByRole("button", { name: "Finished" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    const year = screen.getByRole("combobox", { name: "Election year" }) as HTMLSelectElement;
    expect(year.value).toBe("1988");
  });
});
