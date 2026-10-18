/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LegislaturePageShell, LegislaturePageTabs } from "./LegislaturePageShell";
import { LegislatureMembersTab } from "./LegislatureMembersTab";
import { filterLegislatureBills, legislatureCompositionData } from "./legislaturePresentation";
import type { MembersData } from "./useLegislatureData";
import type { BillDisplay } from "@/lib/legislature/dto/billDisplay";

const composition = vi.hoisted(() =>
  vi.fn((props: { chamberLabel?: string }) => <div>{props.chamberLabel}</div>)
);
vi.mock("@/components/legislature/LegislatureCompositionSection", () => ({
  LegislatureCompositionSection: composition,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const members: MembersData = {
  totalSeats: 10,
  filledSeats: 3,
  vacantSeats: 7,
  composition: [
    { partyId: "p", partyName: "Party", partyColor: "#123", economicPosition: -2, seats: 3 },
  ],
  members: [
    {
      characterId: "person",
      sequentialId: 0,
      characterName: "Member",
      constituency: "North",
      party: "p",
      partyName: "Party",
      partyColor: "#123",
      isNPP: false,
      seatsHeld: 1,
      avatarUrl: "/portrait",
    },
    {
      characterId: "",
      characterName: "Party delegates",
      constituency: "South",
      party: "p",
      partyName: "Party",
      partyColor: "#123",
      isNPP: true,
      seatsHeld: 2,
    },
  ],
};

describe("legislature presentation", () => {
  it("preserves member identities, seat totals, nullable sequence IDs, and avatar opt-in", () => {
    const data = legislatureCompositionData(members, "NG");
    expect(data.members[0]).toEqual({
      id: "person",
      characterId: "person",
      sequentialId: 0,
      characterName: "Member",
      region: "North",
      party: "p",
      partyName: "Party",
      partyColor: "#123",
      countryId: "NG",
      seatsHeld: 1,
      isNPP: false,
      isVacant: false,
    });
    expect(data.members[1].sequentialId).toBeNull();
    expect(data.members[1].id).toBe("");
    expect(data.composition).toEqual([
      {
        party: "p",
        partyName: "Party",
        partyColor: "#123",
        economicPosition: -2,
        seats: 3,
        countryId: "NG",
      },
    ]);
    expect([data.totalSeats, data.filledSeats]).toEqual([10, 3]);
    const avatars = legislatureCompositionData(members, "UK", { includeAvatars: true });
    expect(avatars.members[0].avatarUrl).toBe("/portrait");
    expect(avatars.members[1]).toHaveProperty("avatarUrl", undefined);
    expect(data.members[1]).not.toHaveProperty("avatarUrl");
  });

  it("allows aggregated Nigerian party rows to retain their fallback IDs without mutating data", () => {
    const original = structuredClone(members);
    const data = legislatureCompositionData(members, "NG", {
      memberId: (m) => m.characterId || `npp-${m.party}-${m.constituency}`,
    });
    expect(data.members.map((m) => m.id)).toEqual(["person", "npp-p-South"]);
    expect(members).toEqual(original);
  });

  it("combines status and vote filters in source order, including missing votes", () => {
    const bills = [
      { id: "a", status: "active", myVote: null },
      { id: "b", status: "signed", myVote: "aye" },
      { id: "c", status: "passed_origin" },
      { id: "d", status: "vetoed", myVote: "nay" },
      { id: "e", status: "active_other", myVote: "abstain" },
    ] as BillDisplay[];
    const ids = (rows: BillDisplay[]) => rows.map((b) => b.id);
    expect(ids(filterLegislatureBills(bills, "all", "passed"))).toEqual(["b", "c"]);
    expect(ids(filterLegislatureBills(bills, "voted", "passed"))).toEqual(["b"]);
    expect(ids(filterLegislatureBills(bills, "not_voted", "passed"))).toEqual(["c"]);
    expect(ids(filterLegislatureBills(bills, "all", "failed"))).toEqual(["d"]);
    expect(ids(filterLegislatureBills(bills, "not_voted", "voting"))).toEqual(["a"]);
    expect(ids(filterLegislatureBills(bills, "voted"))).toEqual(["b", "d", "e"]);
    expect(ids(filterLegislatureBills(bills, "not_voted"))).toEqual(["a", "c"]);
    expect(filterLegislatureBills(bills, "all")).toBe(bills);
    expect(filterLegislatureBills(bills, "all", "all")).not.toBe(bills);
    expect(ids(bills)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("legislature shells", () => {
  it("shows the loading hero while keeping tab content, then exposes partial errors and retry", () => {
    const retry = vi.fn();
    const props = {
      error: new Error("offline"),
      onRetry: retry,
      header: <h1>Parliament</h1>,
      children: <p>Tab content</p>,
    };
    const { container, rerender } = render(<LegislaturePageShell {...props} loading />);
    expect(screen.queryByText("Parliament")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.getByText("Tab content")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    rerender(<LegislaturePageShell {...props} loading={false} />);
    expect(screen.getByText("Parliament")).toBeTruthy();
    expect(screen.getByText("Some data failed to load.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("preserves tab order, selected styling, action slots, and selection callbacks", () => {
    const select = vi.fn();
    render(
      <LegislaturePageTabs
        tabs={[
          { id: "bills", label: "Bills" },
          { id: "members", label: "Members" },
        ]}
        activeTab="members"
        onTabChange={select}
      >
        <button>Election action</button>
      </LegislaturePageTabs>
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Bills",
      "Members",
      "Election action",
    ]);
    expect(screen.getByText("Members").className).toContain("border-primary");
    fireEvent.click(screen.getByText("Bills"));
    expect(select).toHaveBeenCalledWith("bills");
  });

  it("renders member loading and empty states, then forwards chamber-specific display options", () => {
    const props = {
      members,
      countryId: "IE" as const,
      chamberLabel: "Dáil Éireann",
      showSeatsColumn: true,
      regionLabel: "Constituency",
      parliamentChartVariant: "horseshoe" as const,
      compositionOptions: { includeAvatars: true },
    };
    const { container, rerender } = render(<LegislatureMembersTab {...props} loading />);
    expect(container.querySelectorAll(".h-10")).toHaveLength(5);
    expect(composition).not.toHaveBeenCalled();
    rerender(<LegislatureMembersTab {...props} members={null} loading={false} />);
    expect(screen.getByText("Composition data unavailable.")).toBeTruthy();
    rerender(<LegislatureMembersTab {...props} loading={false} />);
    expect(composition.mock.calls[0][0]).toMatchObject({
      chamberLabel: "Dáil Éireann",
      parliamentChartVariant: "horseshoe",
      countryId: "IE",
      data: { members: [{ avatarUrl: "/portrait" }, {}] },
    });
  });
});
