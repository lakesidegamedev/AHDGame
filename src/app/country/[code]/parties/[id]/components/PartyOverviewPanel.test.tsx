/** @vitest-environment happy-dom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommitteeData, PartyData } from "./types";
import { PartyOverviewPanel } from "./PartyOverviewPanel";

describe("PartyOverviewPanel leadership labels", () => {
  it("centers the chair and keeps party titles and country defaults", () => {
    const party = {
      countryId: "CN",
      leadershipTitles: { chair: "Party Chair" },
      chair: { id: "chair-id", sequentialId: 27, name: "Lian Zhao", avatarUrl: "/chair.png" },
      viceChair: { id: "deputy-id", name: "Jia Wu" },
      treasurer: null,
      economicPosition: 0,
      socialPosition: 0,
      politicalStrength: 0,
      effectivePsCap: 0,
    } as unknown as PartyData;

    render(<PartyOverviewPanel party={party} committeeResult={null} />);

    expect(screen.getByText("Party Chair")).toBeTruthy();
    expect(screen.getByText("Deputy General Secretary")).toBeTruthy();
    const seats = screen.getAllByRole("listitem");
    expect(seats.map((seat) => seat.textContent)).toEqual([
      expect.stringContaining("Deputy General Secretary"),
      expect.stringContaining("Party Chair"),
      expect.stringContaining("National Treasurer"),
    ]);
    const chairLink = within(seats[1]).getByRole("link", { name: /Lian Zhao/ });
    expect(chairLink.getAttribute("href")).toBe("/character/27");
    expect(chairLink.querySelector("img")?.getAttribute("src")).toContain("chair.png");
    expect(chairLink.querySelector("img")?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(within(seats[2]).getByText("Vacant")).toBeTruthy();
    expect(within(seats[2]).queryByRole("link")).toBeNull();
  });

  it("shows the custom committee name, individual titles and the default beneath portraits", () => {
    const party = {
      countryId: "US",
      economicPosition: 0,
      socialPosition: 0,
      effectivePsCap: 0,
      committeeTitles: {
        name: "National Council",
        member: "Councillor",
        byMember: { first: "Rules Convenor" },
      },
    } as unknown as PartyData;
    const committeeResult = {
      committeeSize: 3,
      committeeMembers: [
        { id: "first", name: "Taylor Lane" },
        { id: "second", name: "Casey Morgan" },
      ],
    } as CommitteeData;

    const { rerender } = render(
      <PartyOverviewPanel party={party} committeeResult={committeeResult} />
    );
    const committee = screen.getByRole("region", { name: "National Council" });
    expect(
      within(committee).getByRole("link", { name: /Rules Convenor Taylor Lane/ })
    ).toBeTruthy();
    expect(within(committee).getByText("Rules Convenor").className).toContain("text-body-sm");
    expect(within(committee).getByRole("link", { name: /Councillor Casey Morgan/ })).toBeTruthy();
    expect(within(committee).getByText("Vacant")).toBeTruthy();
    rerender(
      <PartyOverviewPanel
        party={{ ...party, committeeTitles: undefined }}
        committeeResult={committeeResult}
      />
    );
    expect(screen.getByRole("link", { name: /Committeeman Casey Morgan/ })).toBeTruthy();
  });

  it("renders custom titles as text", () => {
    const title = "<img src=x onerror=alert(1)>";
    const party = {
      countryId: "US",
      leadershipTitles: { chair: title },
      chair: null,
      viceChair: null,
      treasurer: null,
      economicPosition: 0,
      socialPosition: 0,
      politicalStrength: 0,
      effectivePsCap: 0,
    } as unknown as PartyData;

    render(<PartyOverviewPanel party={party} committeeResult={null} />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
