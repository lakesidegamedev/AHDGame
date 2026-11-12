// @vitest-environment happy-dom
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BackgroundCountryOverview } from "../BackgroundCountryOverview";
import type { BackgroundCountryView } from "@/lib/country/background/rules/backgroundCountryView";
import { parseMarketTab } from "@/lib/market/hubTabs";

afterEach(() => cleanup());

const APP_DIR = path.resolve(__dirname, "../../..");

/** Whether `href` lands on a page route under src/app (static or dynamic segments). */
function routeExists(href: string): boolean {
  const pathname = href.split(/[?#]/)[0];
  let dir = APP_DIR;
  for (const segment of pathname.split("/").filter(Boolean)) {
    const exact = path.join(dir, decodeURIComponent(segment));
    if (existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir).find((name) => /^\[[^.\]]+\]$/.test(name));
    if (!dynamic) return false;
    dir = path.join(dir, dynamic);
  }
  return existsSync(path.join(dir, "page.tsx"));
}

/** Full-simulation pages a background country does not have. */
const FULL_SIM_PAGES =
  /\/(legislature|map|region|parties|politicians|elections|executive|approval|budget|policy|unions|general|referendums|state-ownership|nationalization|command-economy|government-contracts|central-bank|metrics|political-metrics|navair|economy)(\/|$)/;

const FULL_VIEW: BackgroundCountryView = {
  countryId: "FR",
  economy: {
    gdp: 2_900_000_000_000,
    growth: 1.2,
    inflation: 2.4,
    unemployment: 7.3,
    debtToGdp: 112,
    creditRating: "AA",
    population: 68_000_000,
  },
  currency: {
    currencyCode: "EUR",
    rate: 0.92,
    baseRate: 0.9,
    rateHistory: [
      { turn: 1, value: 0.9 },
      { turn: 2, value: 0.91 },
      { turn: 3, value: 0.92 },
    ],
  },
  trade: {
    partnerId: "US",
    exports: 1_250_000,
    imports: 980_000,
    partnerTariff: 10,
    ownTariff: 0,
    snapshotTurn: 3,
  },
  politics: {
    headName: "Claire Martin",
    headPartyName: "Renaissance",
    headSinceYear: 2027,
    governmentPartyNames: ["Renaissance", "Les Republicains"],
    approval: 41,
    parties: [
      {
        party: "fr-ren",
        partyName: "Renaissance",
        partyColor: "#ffcc00",
        economicPosition: 1,
        seats: 250,
        voteShare: 0.31,
        inGovernment: true,
      },
      {
        party: "fr-rn",
        partyName: "Rassemblement National",
        partyColor: "#1d2b5c",
        economicPosition: 2,
        seats: 200,
        voteShare: 0.29,
        inGovernment: false,
      },
      {
        party: "fr-lr",
        partyName: "Les Republicains",
        partyColor: "#0066cc",
        economicPosition: 3,
        seats: 127,
        voteShare: 0.12,
        inGovernment: true,
      },
    ],
    totalSeats: 577,
    nextElectionTurn: 200,
    lastElection: { year: 2027, snap: false, governmentChanged: true },
  },
  bonds: [
    {
      id: "64b000000000000000000001",
      couponRate: 3.25,
      maturityTurn: 340,
      marketPrice: 0.98,
      faceValue: 1000,
    },
  ],
  nationalIndex: {
    name: "France National Index",
    slug: "fr-national",
    countryId: "FR",
    level: 1.04,
  },
  alliances: [
    { id: "EU", name: "European Union", shortName: "EU" },
    { id: "NATO", name: "North Atlantic Treaty Organization", shortName: "NATO" },
  ],
  crises: [{ id: "64b0000000000000000000aa", name: "Farm Strike", startTurn: 12 }],
  fiscal: {
    interestSpiralYears: 1,
    spiralLimitYears: 2,
    programmesRemainingPercent: 96,
    taxRisePercent: 2.5,
    lastPackage: {
      fiscalYear: 2029,
      turn: 300,
      size: 1.4,
      taxRise: 0.6,
      spendingCut: 0.8,
      approvalCost: 3.2,
    },
  },
  briefs: [
    {
      id: "FR:austerity:300",
      kind: "austerity",
      headline: "France announces an austerity package",
      body: "France will consolidate its budget.",
      turn: 300,
      actions: [
        { kind: "bonds", label: "Buy FR bonds", href: "/bond/64b0000000000000000000bb" },
        {
          kind: "index_fund",
          label: "Buy France National Index",
          href: "/stockmarket/fr/fund/fr-national",
        },
        { kind: "currency", label: "Trade EUR", href: "/country/fr/forex" },
        { kind: "trade", label: "World trade", href: "/world/trade" },
      ],
    },
  ],
};

const EMPTY_VIEW: BackgroundCountryView = {
  countryId: "PL",
  economy: {
    gdp: null,
    growth: null,
    inflation: null,
    unemployment: null,
    debtToGdp: null,
    creditRating: null,
    population: null,
  },
  currency: null,
  trade: null,
  politics: null,
  bonds: [],
  nationalIndex: null,
  alliances: [],
  crises: [],
  fiscal: null,
  briefs: [],
};

function show(view: BackgroundCountryView, name: string) {
  return render(
    <BackgroundCountryOverview view={view} name={name} startingYear={2027} clock={{}} />
  );
}

function hrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
}

describe("BackgroundCountryOverview", () => {
  it("renders the headline economy, government, trade, currency, investing, alliances and crises", () => {
    show(FULL_VIEW, "France");
    expect(screen.getByRole("heading", { level: 1, name: "France" })).toBeTruthy();
    const economy = screen.getByTestId("background-economy");
    expect(economy.textContent).toContain("Growth");
    expect(economy.textContent).toContain("1.2%");
    expect(economy.textContent).toContain("7.3%");
    expect(economy.textContent).toContain("112%");
    expect(economy.textContent).toContain("AA");

    const government = screen.getByTestId("background-government");
    expect(government.textContent).toContain("Claire Martin");
    expect(government.textContent).toContain("Renaissance, Les Republicains");
    expect(government.textContent).toContain("41%");
    expect(government.querySelector("svg")).toBeTruthy();

    const trade = screen.getByTestId("background-trade");
    expect(trade.textContent).toContain("US tariff on its goods");
    expect(trade.textContent).toContain("10.0%");

    expect(screen.getByTestId("background-currency").textContent).toContain("Trade EUR");
    expect(screen.getByTestId("background-invest").textContent).toContain("France National Index");
    expect(screen.getByTestId("background-alliances").textContent).toContain("NATO");
    expect(screen.getByTestId("background-crises").textContent).toContain("Farm Strike");
  });

  it("shows the briefs with their actions and the fiscal state", () => {
    show(FULL_VIEW, "France");
    const briefs = screen.getByTestId("background-briefs");
    expect(briefs.textContent).toContain("France announces an austerity package");
    expect(briefs.textContent).toContain("Buy FR bonds");
    expect(briefs.textContent).toContain("Trade EUR");
    const fiscal = screen.getByTestId("background-fiscal");
    expect(fiscal.textContent).toContain("1 of 2 years");
    expect(screen.getByTestId("background-austerity").textContent).toContain("fiscal year 2029");
  });

  it("explains an empty brief list and a missing fiscal record", () => {
    show(EMPTY_VIEW, "Poland");
    expect(screen.getByTestId("background-briefs").textContent).toContain("No briefs yet");
    expect(screen.getByTestId("background-fiscal").textContent).toContain("No fiscal record");
  });

  it("renders placeholders when the politics, market and investing data are not there yet", () => {
    show(EMPTY_VIEW, "Poland");
    expect(screen.getByTestId("background-government").textContent).toContain(
      "has not been formed yet"
    );
    expect(screen.getByTestId("background-trade").textContent).toContain("No trade recorded");
    expect(screen.getByTestId("background-invest").textContent).toContain("No government bonds");
    expect(screen.getByTestId("background-economy").textContent).toContain("n/a");
  });

  it("links only to pages that exist, and never to a full-simulation page", () => {
    for (const [view, name] of [
      [FULL_VIEW, "France"],
      [EMPTY_VIEW, "Poland"],
    ] as const) {
      const { container, unmount } = show(view, name);
      const links = hrefs(container);
      expect(links.length).toBeGreaterThan(0);
      for (const href of links) {
        expect(routeExists(href), `${href} has no page`).toBe(true);
        expect(FULL_SIM_PAGES.test(href), `${href} is a full-simulation page`).toBe(false);
      }
      unmount();
    }
  });

  it("points the bond market link at a real market tab", () => {
    const { container } = show(EMPTY_VIEW, "Poland");
    const bondMarket = hrefs(container).find((href) => href.startsWith("/market"));
    expect(bondMarket).toBeDefined();
    const tab = new URLSearchParams(bondMarket!.split("?")[1]).get("tab");
    expect(parseMarketTab(tab)).toBe("bonds");
  });
});
