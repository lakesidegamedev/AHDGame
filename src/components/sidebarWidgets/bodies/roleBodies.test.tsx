// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en/nav.json";
import { SidebarWidget, widgetBadge } from "../SidebarWidget";
import type { ChamberFloorWidgetData } from "@/lib/sidebarWidgets/data/chamberFloor";
import type { MyRaceWidgetData } from "@/lib/sidebarWidgets/data/myRace";
import type { OfficeDashboardWidgetData } from "@/lib/sidebarWidgets/data/officeDashboard";
import type { SinceAwayWidgetData } from "@/lib/sidebarWidgets/data/sinceAway";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

const w = en.nav.widgets;

function show(widgetKey: string, data: unknown) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SidebarWidget widgetKey={widgetKey} data={data} loaded />
    </NextIntlClientProvider>
  );
}

const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

afterEach(cleanup);

describe("role widget bodies", () => {
  it("shows a race with the leader, place and links to the race and campaign", () => {
    const race: MyRaceWidgetData = {
      electionId: "e1",
      office: "Senate",
      region: "CA",
      status: "active",
      turnsLeft: 3,
      myPct: 40,
      myRank: 2,
      candidates: 3,
      leader: { name: "Rival", pct: 52.5, isMe: false },
      mySeats: null,
      campaignId: "c1",
    };
    show("myRace", race);
    expect(screen.getByText("Senate · CA")).toBeTruthy();
    expect(screen.getByText("3 turns left")).toBeTruthy();
    expect(screen.getByText("Position 2 of 3")).toBeTruthy();
    expect(screen.getByText("Rival")).toBeTruthy();
    expect(screen.getByText("52.5%")).toBeTruthy();
    // Shares are drawn as meters against a majority tick for one seat.
    const meters = screen.getAllByRole("meter");
    expect(meters.map((meter) => meter.getAttribute("aria-valuenow"))).toEqual(["40", "52.5"]);
    expect(href(w.myRace.election)).toBe("/elections/e1");
    expect(href(w.myRace.campaign)).toBe("/campaign/c1");
  });

  it("says when no votes are projected yet", () => {
    show("myRace", {
      electionId: "e1",
      office: "President",
      region: null,
      status: "upcoming",
      turnsLeft: 1,
      myPct: null,
      myRank: null,
      candidates: 0,
      leader: null,
      mySeats: null,
      campaignId: null,
    } satisfies MyRaceWidgetData);
    expect(screen.getByText(w.myRace.noVotes)).toBeTruthy();
    expect(screen.getByText("Opens in 1 turn")).toBeTruthy();
    expect(screen.queryByRole("link", { name: w.myRace.campaign })).toBeNull();
  });

  it("lists floor bills with the viewer's vote", () => {
    const floor: ChamberFloorWidgetData = {
      countryId: "US",
      chamber: "House",
      total: 3,
      bills: [
        { id: "b1", title: "Schools Act", vote: null, turnsLeft: 2 },
        { id: "b2", title: "Roads Act", vote: "against", turnsLeft: 0 },
      ],
    };
    show("chamberFloor", floor);
    expect(screen.getByRole("heading", { name: "House" })).toBeTruthy();
    expect(href(/Schools Act/)).toBe("/congress/bills/b1");
    expect(screen.getByText(w.chamberFloor.notVoted)).toBeTruthy();
    expect(screen.getByText(w.chamberFloor.against)).toBeTruthy();
    expect(screen.getByText("1 more bill in your chamber")).toBeTruthy();
    // Due soon already counts unvoted bills on the rail, so the floor adds no badge.
    expect(widgetBadge("chamberFloor", floor)).toBe(0);
  });

  it("says when nothing is up for a vote", () => {
    show("chamberFloor", { countryId: "US", chamber: "Senate", total: 0, bills: [] });
    expect(screen.getByText(w.chamberFloor.empty)).toBeTruthy();
  });

  it("shows a state office with its numbers and region links", () => {
    const office: OfficeDashboardWidgetData = {
      scope: "state",
      countryId: "US",
      stateId: "CA",
      name: "California",
      approval: 54,
      budgetBalance: -100,
      currencyCode: null,
      gdpGrowth: 2.1,
      unemployment: null,
    };
    show("officeDashboard", office);
    expect(screen.getByText("California")).toBeTruthy();
    expect(screen.getByText("54.0%")).toBeTruthy();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("54");
    expect(screen.getByText("▲2.1%")).toBeTruthy();
    // Missing figures are left out rather than shown as blanks.
    expect(screen.queryByText(w.officeDashboard.unemployment)).toBeNull();
    expect(href(w.officeDashboard.office)).toBe("/country/us/region/CA/office");
    expect(href(w.officeDashboard.budget)).toBe("/country/us/region/CA?tab=economy&sub=budget");
  });

  it("links a national office to the nation's economy and budget", () => {
    show("officeDashboard", {
      scope: "nation",
      countryId: "UK",
      stateId: null,
      name: "United Kingdom",
      approval: 40,
      budgetBalance: 10,
      currencyCode: null,
      gdpGrowth: -0.4,
      unemployment: 5,
    } satisfies OfficeDashboardWidgetData);
    expect(screen.getByText("▼0.4%")).toBeTruthy();
    expect(href(w.officeDashboard.economy)).toBe("/country/uk/economy");
    expect(href(w.officeDashboard.budget)).toBe("/country/uk/budget");
  });

  it("sums up the last turn and groups unread notifications", () => {
    const away: SinceAwayWidgetData = {
      turn: 100,
      netWorthChange: null,
      netWorthChangePct: 10,
      cashChange: null,
      currencyCode: null,
      holdings: [{ kind: "stocks", change: -3.25 }],
      unread: [
        { category: "crisis", count: 4 },
        { category: "legislation", count: 3 },
      ],
      unreadTotal: 7,
      unreadCapped: false,
    };
    show("sinceAway", away);
    expect(screen.getByRole("heading", { name: w.sinceAway.title })).toBeTruthy();
    expect(screen.getByText("(+10.0%)")).toBeTruthy();
    expect(screen.getByText("-3.3%")).toBeTruthy();
    expect(screen.getByText("7 unread notifications")).toBeTruthy();
    expect(screen.getByText("Crisis 4 · Legislation 3")).toBeTruthy();
  });

  it("explains an empty first turn and an empty inbox", () => {
    show("sinceAway", {
      turn: null,
      netWorthChange: null,
      netWorthChangePct: null,
      cashChange: null,
      currencyCode: null,
      holdings: [],
      unread: [],
      unreadTotal: 0,
      unreadCapped: false,
    } satisfies SinceAwayWidgetData);
    expect(screen.getByText(w.sinceAway.noHistory)).toBeTruthy();
    expect(screen.getByText(w.sinceAway.noUnread)).toBeTruthy();
  });
});
