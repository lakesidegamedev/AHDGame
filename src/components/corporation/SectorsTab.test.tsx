/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/corporations.json";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SectorsTab from "./SectorsTab";
import type { SectorDetail } from "./CorporationPageTypes";

vi.mock("./ExpandMarketModal", () => ({
  default: ({
    initialSectorType,
    initialStateId,
  }: {
    initialSectorType?: string;
    initialStateId?: string;
  }) => (
    <div
      data-testid="expand-modal"
      data-sector-type={initialSectorType ?? ""}
      data-state-id={initialStateId ?? ""}
    >
      Expand modal open
    </div>
  ),
}));

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (v: number) => `$${v}`,
    toInternalFrom: (v: number) => v,
  }),
}));

const baseProps = {
  sectors: [],
  corpId: "corp-1",
  corporationType: "defense" as const,
  liquidCapital: 40_000,
  logisticsStrength: 0,
  onAbandonSector: () => undefined,
  abandoningSectorId: null,
  sectorsMessage: null,
  currentTurn: 10,
  plantsMode: true,
};

function render(ui: ReactElement) {
  return renderView(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

describe("SectorsTab Build-here deep link", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the expand modal only after isCeo resolves (ticket #1004 race)", async () => {
    const onConsumed = vi.fn();
    const { rerender } = render(
      <SectorsTab
        {...baseProps}
        isCeo={false}
        expandOnMount
        expandSectorType="defense"
        expandStateId="MD"
        onExpandDeepLinkConsumed={onConsumed}
      />
    );

    expect(screen.queryByTestId("expand-modal")).toBeNull();
    expect(onConsumed).not.toHaveBeenCalled();

    rerender(
      <SectorsTab
        {...baseProps}
        isCeo
        expandOnMount
        expandSectorType="defense"
        expandStateId="MD"
        onExpandDeepLinkConsumed={onConsumed}
      />
    );

    await waitFor(() => expect(screen.getByTestId("expand-modal")).toBeTruthy());
    const modal = screen.getByTestId("expand-modal");
    expect(modal.getAttribute("data-sector-type")).toBe("defense");
    expect(modal.getAttribute("data-state-id")).toBe("MD");
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("does not open the expand modal without the deep-link flag", () => {
    render(<SectorsTab {...baseProps} isCeo />);
    expect(screen.queryByTestId("expand-modal")).toBeNull();
  });
});

describe("media advertising output on corporation sector cards", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows market-factor campaign ledger units in the sector revenue detail", () => {
    const { container } = render(
      <SectorsTab
        {...baseProps}
        sectors={[
          sector({
            _id: "media-market",
            sectorType: "media",
            mediaAdvertisingCampaignUnits: 137,
            mediaAdvertisingCampaignFactor: 0.1,
          }),
        ]}
        isCeo={false}
      />
    );

    fireEvent.mouseEnter(container.querySelectorAll(".cursor-help")[0]);
    expect(screen.getByText("Advertising campaigns counted")).toBeTruthy();
    expect(screen.getByText("137/day (10% factor)")).toBeTruthy();
  });

  it("shows zero planned-economy campaign output and its factor", () => {
    const { container } = render(
      <SectorsTab
        {...baseProps}
        sectors={[
          sector({
            _id: "media-planned",
            sectorType: "media",
            producedUnits: 0,
            mediaAdvertisingCampaignUnits: 0,
            mediaAdvertisingCampaignFactor: 0.25,
          }),
        ]}
        isCeo={false}
      />
    );

    fireEvent.mouseEnter(container.querySelectorAll(".cursor-help")[0]);
    expect(screen.getByText("Advertising campaigns counted")).toBeTruthy();
    expect(screen.getByText("0/day (25% factor)")).toBeTruthy();
  });
});

function sector(over: Partial<SectorDetail> & Pick<SectorDetail, "_id" | "sectorType">) {
  return {
    industryModel: null,
    stateId: "OH",
    stateName: "Ohio",
    sectorLabel: "Sector",
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    revenue: 1_000_000,
    financialRevenue: 1_000_000,
    realizedRevenue: 1_000_000,
    profitMargin: 10,
    effectiveProfitMargin: 10,
    marketSharePercent: 10,
    unemploymentModifier: 0,
    gridReliabilityModifier: 0,
    corruptionModifier: 0,
    workforceSkillModifier: null,
    crimeRateModifier: null,
    broadbandModifier: null,
    roadConditionModifier: null,
    carbonEmissionsModifier: null,
    costOfLivingModifier: null,
    commodityModifier: 0,
    homeLocationModifier: 0,
    stateSectorSpecializationModifier: 0,
    inflationModifier: 0,
    debtToGdpModifier: 0,
    deficitToGdpModifier: 0,
    foreignTariffModifier: 0,
    domesticTariffMalus: 0,
    profit: 100_000,
    workers: 1_000,
    capacityUnits: 10_000,
    plantCount: 2,
    producedUnits: 9_300,
    soldUnits: 9_000,
    ...over,
  } as SectorDetail;
}

const mixedSectors = [
  sector({
    _id: "s1",
    sectorType: "manufacturing",
    strategyId: "heavy_metals",
    displayName: "Cleveland Works",
  }),
  sector({
    _id: "s2",
    sectorType: "manufacturing",
    strategyId: "electronics_manufacturing",
    stateId: "MI",
    stateName: "Michigan",
    displayName: "Flint Assembly",
  }),
  sector({
    _id: "s3",
    sectorType: "energy",
    strategyId: "renewables",
    stateId: "NM",
    stateName: "New Mexico",
    displayName: "Albuquerque Solar",
  }),
];

/** Pick a division from the sector type select. */
function pickType(value: string) {
  // The select value is the full model-aware identity
  // (sectorType:industryModel:mediaDiscriminator). These fixtures are
  // legacy-shaped sectors, so both model fields are empty.
  fireEvent.change(screen.getByLabelText("Sector type"), {
    target: { value: value.includes(":") ? value : `${value}::` },
  });
}

describe("SectorsTab type select and dossier", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every owned type and shows every sector until one is picked", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);

    const select = screen.getByLabelText("Sector type") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(within(select).getByRole("option", { name: /All types/ })).toBeTruthy();
    expect(within(select).getByRole("option", { name: /Manufacturing/ })).toBeTruthy();
    expect(within(select).getByRole("option", { name: /Energy/ })).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Owned sectors" })).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Operating strategy" })).toBeNull();
  });

  it("opens the division dossier, its strategy panel and a retitled table", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);
    pickType("manufacturing");

    // Two sectors holding two plants each: the headline counts facilities, not
    // the sectors that own them.
    expect(screen.getByRole("heading", { name: "4 plants in 2 states" })).toBeTruthy();
    expect(screen.getByText("Manufacturing division")).toBeTruthy();
    expect(screen.getByText("Line utilisation")).toBeTruthy();

    const strategyTabs = screen.getByRole("tablist", { name: "Operating strategy" });
    expect(within(strategyTabs).getByRole("tab", { name: /Heavy Metals/ })).toBeTruthy();
    expect(
      within(strategyTabs).getByRole("tab", { name: /Electronics Manufacturing/ })
    ).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Manufacturing plants" })).toBeTruthy();
    expect((screen.getByLabelText("Sector type") as HTMLSelectElement).value).toBe(
      "manufacturing::"
    );
  });

  it("filters the table to the chosen type", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);

    // Rows render a desktop and a phone layout, so names appear more than once.
    expect(screen.getAllByText("Albuquerque Solar").length).toBeGreaterThan(0);
    pickType("manufacturing");
    expect(screen.queryAllByText("Albuquerque Solar")).toHaveLength(0);
    expect(screen.getAllByText("Cleveland Works").length).toBeGreaterThan(0);
  });

  it("opens the expand modal already pointed at the open division", async () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);
    pickType("energy");

    fireEvent.click(screen.getAllByRole("button", { name: /Build a power station/ })[0]);
    await waitFor(() => expect(screen.getByTestId("expand-modal")).toBeTruthy());
    expect(screen.getByTestId("expand-modal").getAttribute("data-sector-type")).toBe("energy");
  });

  it("shows no placeholder levers for controls the game does not have", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);
    pickType("manufacturing");

    expect(screen.queryByRole("button", { name: "Retool line" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch ▾" })).toBeNull();
  });

  it("offers exactly one build button, pointed at the open division", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);
    pickType("manufacturing");

    // The toolbar carries it. The dossier and the strategy panel used to add
    // their own, and the panel's only differed by pre-selecting a strategy.
    const builds = screen.getAllByRole("button", { name: /Build a plant/ });
    expect(builds).toHaveLength(1);
    for (const button of builds) expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /Build a plant · / })).toBeNull();
  });

  it("keeps a site whose stored strategy no longer exists visible in the panel", () => {
    const orphaned = [
      sector({
        _id: "o1",
        sectorType: "manufacturing",
        strategyId: "a_removed_method",
        displayName: "Orphan Works",
      }),
    ];
    render(<SectorsTab {...baseProps} sectors={orphaned} isCeo />);
    pickType("manufacturing");

    // It must land in some tab rather than vanishing: the badges have to sum
    // to the division's site count.
    const tabs = within(screen.getByRole("tablist", { name: "Operating strategy" })).getAllByRole(
      "tab"
    );
    const counted = tabs.reduce(
      (sum, t) => sum + Number(t.textContent?.match(/(\d+)$/)?.[1] ?? 0),
      0
    );
    expect(counted).toBe(1);
  });

  it("unfilters the table when the last sector of the open division goes away", () => {
    const { rerender } = render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo />);
    pickType("energy");
    expect(screen.getByRole("heading", { name: "Energy power stations" })).toBeTruthy();

    // The CEO abandons the only energy sector. The select loses the type, and
    // the table must fall back to every sector rather than filtering to nothing.
    rerender(
      <SectorsTab
        {...baseProps}
        sectors={mixedSectors.filter((s) => s.sectorType !== "energy")}
        isCeo
      />
    );
    expect(screen.getByRole("heading", { name: "Owned sectors" })).toBeTruthy();
    expect(screen.getAllByText("Cleveland Works").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tablist", { name: "Operating strategy" })).toBeNull();
  });

  it("still filters the table for a sector type the constants no longer name", () => {
    // `sectorType` is a plain string on the wire and a row can carry a type
    // that predates a rename. Picking it must still filter, even though there
    // is no dossier, palette or strategy table to open for it.
    const legacy = [
      ...mixedSectors,
      sector({
        _id: "x1",
        sectorType: "shipbuilding" as never,
        stateId: "ME",
        stateName: "Maine",
        displayName: "Bath Yards",
      }),
    ];
    render(<SectorsTab {...baseProps} sectors={legacy} isCeo />);
    expect(
      within(screen.getByLabelText("Sector type")).getByRole("option", { name: /shipbuilding/ })
    ).toBeTruthy();

    pickType("shipbuilding");
    expect((screen.getByLabelText("Sector type") as HTMLSelectElement).value).toBe(
      "shipbuilding::"
    );
    expect(screen.getAllByText("Bath Yards").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Cleveland Works")).toHaveLength(0);
    // No dossier and no strategy panel: there is nothing known to describe.
    expect(screen.queryByText(/ division$/)).toBeNull();
    expect(screen.queryByRole("tablist", { name: "Operating strategy" })).toBeNull();
  });

  it("shows no proposed levers to an outsider", () => {
    render(<SectorsTab {...baseProps} sectors={mixedSectors} isCeo={false} />);
    pickType("manufacturing");

    expect(screen.queryByRole("button", { name: "Retool line" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch ▾" })).toBeNull();
    // The dossier is not CEO-only: an outsider still gets the briefing.
    expect(screen.getByText("Manufacturing division")).toBeTruthy();
  });
});

describe("SectorsTab folded media lanes", () => {
  afterEach(() => {
    cleanup();
  });

  const mediaSectors = [
    sector({ _id: "m1", sectorType: "media", displayName: "Daily Courier" }),
    sector({
      _id: "m2",
      sectorType: "media",
      mediaDiscriminator: "entertainment",
      displayName: "Lakeshore Studios",
    }),
  ];

  it("groups entertainment media apart from ordinary media with its own label", () => {
    render(<SectorsTab {...baseProps} sectors={mediaSectors} isCeo />);
    const select = screen.getByLabelText("Sector type") as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: /Entertainment media/ })).toBeTruthy();
    expect(within(select).getByRole("option", { name: /^Media/ })).toBeTruthy();

    pickType("media::entertainment");
    expect(screen.getAllByText("Lakeshore Studios").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Daily Courier")).toHaveLength(0);

    pickType("media::");
    expect(screen.getAllByText("Daily Courier").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Lakeshore Studios")).toHaveLength(0);
  });
});

describe("SectorsTab margins drawer", () => {
  beforeEach(() => {
    // Panels inside the tab load their own data; keep these renders offline.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const openDrawer = () =>
    fireEvent.click(screen.getAllByRole("button", { name: "Show margin breakdown" })[0]);

  it("drawer shows capacity to net profit", () => {
    render(
      <SectorsTab
        {...baseProps}
        isCeo
        sectors={[sector({ _id: "p1", sectorType: "manufacturing", displayName: "Akron Works" })]}
      />
    );
    openDrawer();
    const drawer = screen.getByRole("region", { name: "Margins, Akron Works" });
    expect(within(drawer).getByRole("heading", { name: "Plants → net profit" })).toBeTruthy();
    for (const line of ["Plants", "Produced", "Sold", "Operating profit", "Net profit"]) {
      expect(within(drawer).getAllByText(line).length).toBeGreaterThan(0);
    }
    expect(within(drawer).getByText("Effective margin build")).toBeTruthy();
    expect(within(drawer).getByText("Production policy")).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "Build capacity" }).getAttribute("href")).toBe(
      "/corporation/corp-1/sector/p1?build=1"
    );
    expect(within(drawer).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(
      "/corporation/corp-1/sector/p1"
    );
    expect(within(drawer).getByRole("button", { name: "Abandon" })).toBeTruthy();
    // Splitting is a move against a rival, never on your own plants.
    expect(within(drawer).queryByRole("link", { name: "Split rival plants" })).toBeNull();
  });

  it("offers a rival the split planner from the drawer", () => {
    render(
      <SectorsTab
        {...baseProps}
        isCeo={false}
        canSplitRivalPlants
        sectors={[sector({ _id: "p1", sectorType: "manufacturing", displayName: "Akron Works" })]}
      />
    );
    openDrawer();
    const drawer = screen.getByRole("region", { name: "Margins, Akron Works" });
    expect(
      within(drawer).getByRole("link", { name: "Split rival plants" }).getAttribute("href")
    ).toBe("/corporation/corp-1/sector/p1?split=1");
    expect(within(drawer).queryByRole("link", { name: "Build capacity" })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: "Abandon" })).toBeNull();
  });

  it("legacy rows keep the growth bar", () => {
    render(
      <SectorsTab
        {...baseProps}
        plantsMode={false}
        isCeo
        onGrowthChange={() => undefined}
        sectors={[sector({ _id: "g1", sectorType: "manufacturing", displayName: "Old Mill" })]}
      />
    );
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
    openDrawer();
    const drawer = screen.getByRole("region", { name: "Margins, Old Mill" });
    expect(within(drawer).queryByRole("heading", { name: "Plants → net profit" })).toBeNull();
    expect(within(drawer).getByText("Effective margin build")).toBeTruthy();
  });
});

describe("SectorsTab plants columns", () => {
  afterEach(() => {
    cleanup();
  });

  it("leads with plants, keeps units in the tooltip, and labels running and sold", () => {
    render(
      <SectorsTab
        {...baseProps}
        isCeo
        sectors={[
          sector({
            _id: "w1",
            sectorType: "manufacturing",
            displayName: "Akron Works",
            plantCount: 14,
            capacityUnits: 899,
            producedUnits: 494,
            soldUnits: 222,
            fillRate: 0.45,
            fillRateBand: "low",
          }),
        ]}
      />
    );
    const count = screen.getAllByText("14 plants")[0];
    expect(count.getAttribute("title")).toMatch(/about 899 units of output a day/);
    expect(screen.queryByText(/^899$/)).toBeNull();
    expect(screen.queryByText(/% used/)).toBeNull();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("55%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45%").length).toBeGreaterThan(0);
  });

  it("reads a sector with no plants as not running yet", () => {
    render(
      <SectorsTab
        {...baseProps}
        isCeo
        sectors={[
          sector({
            _id: "z1",
            sectorType: "logistics",
            displayName: "Hartford Depot",
            plantCount: 0,
            capacityUnits: 0,
            producedUnits: 0,
            soldUnits: 0,
            fillRate: null,
            fillRateBand: null,
            workers: 0,
          }),
        ]}
      />
    );
    expect(screen.getAllByText("No depots yet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not running yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 / 0 plants")).toBeNull();
  });
});
