/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import InputsOutputsPanel from "./InputsOutputsPanel";
import type { CommoditiesData, CommodityFlow, PlantsData } from "../types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

function flow(
  partial: Pick<CommodityFlow, "commodity" | "label" | "icon"> & Partial<CommodityFlow>
): CommodityFlow {
  return {
    colors: "border-card-border",
    unit: "u",
    units: 0.1,
    rate: 1,
    basePrice: 100,
    globalPrice: 100,
    nationalPrice: 100,
    regionalPrice: 100,
    marketPrice: 100,
    weight: 10,
    priceImpact: 0,
    ...partial,
  };
}

const commodities: CommoditiesData = {
  supplies: [
    flow({
      commodity: "advertising",
      label: "Advertising & Media",
      icon: "Ad",
      units: 1.2,
      marketPrice: 3.36,
    }),
  ],
  demands: [
    flow({
      commodity: "software",
      label: "Software & IT Services",
      icon: "SW",
      billedUnitPrice: 619.76,
      inputAvailability: 0.66,
      shortageRatio: 1.5,
    }),
    flow({
      commodity: "electronics",
      label: "Electronics & Semiconductors",
      icon: "Si",
      billedUnitPrice: 309.88,
      inputAvailability: 0.61,
      shortageRatio: 1.5,
    }),
  ],
  commodityMarginModifier: -8,
  throughput: { bindingInput: "electronics", applied: 0.61, projected: 0.61 },
};

const plants = { fillRate: 0.9 } as PlantsData;

describe("InputsOutputsPanel own supply", () => {
  const panel = (ownSupply: CommodityFlow["ownSupply"], inputAvailability = 0.7) =>
    render(
      <InputsOutputsPanel
        commodities={{
          ...commodities,
          demands: [
            flow({
              commodity: "pharmaceuticals",
              label: "Pharmaceuticals",
              icon: "Rx",
              inputAvailability,
              ownSupply,
            }),
          ],
        }}
        plants={plants}
        countryId="JP"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

  it("says where own output is made and why it did not reach a short plant", () => {
    const { container } = panel({
      sourceStateIds: ["HOK"],
      sourceStateNames: ["Hokkaido"],
      reasons: ["no_route", "agreement_reserved"],
    });
    const note = container.querySelector("[data-own-supply-note]");
    expect(note?.textContent).toContain("Pharmaceuticals, made in Hokkaido");
    expect(note?.textContent).toContain("None of it was hauled to this region");
    expect(note?.textContent).toContain("A supply agreement covers part");
    expect(note?.textContent).not.toMatch(/[–—]/);
  });

  it("points a market-first company at its supply policy", () => {
    panel({
      sourceStateIds: ["HOK", "KAN"],
      sourceStateNames: ["Hokkaido", "Kanto"],
      reasons: ["market_priority"],
    });
    expect(screen.getByText(/made in Hokkaido and Kanto/)).toBeTruthy();
    expect(screen.getByText(/Choose own plants first/)).toBeTruthy();
  });

  it("gives funded reasons: own output used up, and how much was made", () => {
    const { container } = panel({
      sourceStateIds: ["HOK"],
      sourceStateNames: ["Hokkaido"],
      reasons: ["used_by_own_sites", "made_only"],
      output: { made: 48, ownSites: 48, soldOutside: 0 },
    });
    const note = container.querySelector("[data-own-supply-note]");
    expect(note?.textContent).toContain(
      "Your own output of Pharmaceuticals was fully used by your other sites."
    );
    expect(note?.textContent).toContain("Your sites made only 48 a day.");
    expect(note?.textContent).not.toContain("hauled");
    expect(note?.textContent).not.toMatch(/[\u2013\u2014]/);
  });

  it("names an explicit open market choice and what outside buyers took", () => {
    panel({
      sourceStateIds: ["HOK"],
      sourceStateNames: ["Hokkaido"],
      reasons: ["sold_first", "made_only"],
      output: { made: 48, ownSites: 8, soldOutside: 40 },
    });
    expect(screen.getByText(/outside buyers took 40 a day/)).toBeTruthy();
  });

  it("stays quiet once the input is fully covered", () => {
    const { container } = panel(
      { sourceStateIds: ["HOK"], sourceStateNames: ["Hokkaido"], reasons: ["no_route"] },
      1
    );
    expect(container.querySelector("[data-own-supply-notes]")).toBeNull();
  });

  it("folds several short inputs into one collapsed block", () => {
    const ownSupply = {
      sourceStateIds: ["HOK"],
      sourceStateNames: ["Hokkaido"],
      reasons: ["no_route" as const],
    };
    const { container } = render(
      <InputsOutputsPanel
        commodities={{
          ...commodities,
          demands: [
            flow({
              commodity: "pharmaceuticals",
              label: "Pharmaceuticals",
              icon: "Rx",
              inputAvailability: 0.7,
              ownSupply,
            }),
            flow({
              commodity: "plastics",
              label: "Plastics",
              icon: "Pl",
              inputAvailability: 0.6,
              ownSupply,
            }),
          ],
        }}
        plants={plants}
        countryId="JP"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );
    const blocks = container.querySelectorAll("details[data-own-supply-notes]");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.querySelector("summary")?.textContent).toContain(
      "makes Pharmaceuticals and Plastics too"
    );
    expect(blocks[0]!.querySelectorAll("[data-own-supply-note]")).toHaveLength(2);
  });
});

describe("InputsOutputsPanel layout", () => {
  it("pairs an applied throttle with its recorded input, not the world projection", () => {
    const throttled: CommoditiesData = {
      ...commodities,
      throughput: { bindingInput: "iron", applied: 0.85, projected: 0.5 },
    };
    render(
      <InputsOutputsPanel
        commodities={throttled}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

    const bindingInput = screen.getByText("Iron Ore");
    const callout = bindingInput.closest("p");
    expect(callout?.textContent).toContain(
      "Last turn, short supply of Iron Ore was the binding input."
    );
    expect(callout?.textContent).toContain("85%");
  });

  it("quotes the engine's applied floor instead of the raw 50% minimum", () => {
    const pinned: CommoditiesData = {
      ...commodities,
      throughput: { bindingInput: "iron", applied: 0.85, projected: 0.5, floor: 0.85 },
    };
    render(
      <InputsOutputsPanel
        commodities={pinned}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

    const callout = screen.getByText("Iron Ore").closest("p");
    expect(callout?.textContent).toContain("never takes that limit below 85%");
    expect(callout?.textContent).not.toContain("50%");
  });

  it("quotes the run meter's input slice, not the availability throttle, as what the plants lost", () => {
    const throttled: CommoditiesData = {
      ...commodities,
      throughput: { bindingInput: "iron", applied: 0.958, projected: 0.5, floor: 0.85 },
    };
    render(
      <InputsOutputsPanel
        commodities={throttled}
        plants={
          {
            fillRate: 0.15,
            capacityUnits: 52620,
            producedUnits: 14699.9,
            soldUnits: 8000,
            idleCauses: [{ cause: "inputs", units: 39106 }],
          } as PlantsData
        }
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

    const callout = screen.getByText("Iron Ore").closest("p");
    expect(callout?.textContent).toContain("It held 74% of your capacity idle");
    expect(callout?.textContent).not.toContain("ran at");
  });

  it("does not call a projected shortage the cause of a throttle that has not been applied", () => {
    const projected: CommoditiesData = {
      ...commodities,
      throughput: { bindingInput: "real_estate_services", applied: null, projected: 0.5 },
    };
    render(
      <InputsOutputsPanel
        commodities={projected}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

    expect(screen.queryByText(/waiting on inputs/i)).toBeNull();
  });

  it("keeps buy and make columns from sharing a grid track", () => {
    const { container } = render(
      <InputsOutputsPanel
        commodities={commodities}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

    expect(screen.getByRole("heading", { name: /things you buy/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /things you make/i })).toBeTruthy();
    expect(screen.getByText("Software & IT Services")).toBeTruthy();
    expect(screen.getByText("Advertising & Media")).toBeTruthy();

    const grid = container.querySelector("[data-io-grid]");
    expect(grid?.className).toMatch(/min-w-0/);
    expect(grid?.className).toMatch(/xl:grid-cols-2/);
    const sections = container.querySelectorAll("[data-io-grid] > section");
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.className).toMatch(/min-w-0/);
    }
  });

  it("explains the exact global price drivers without calling them regional", () => {
    const attributed: CommoditiesData = {
      ...commodities,
      supplies: [
        flow({
          commodity: "advertising",
          label: "Advertising & Media",
          icon: "Ad",
          priceAttribution: {
            appliedPrice: 120,
            realBasePrice: 100,
            nominalInflation: 10,
            scarcityMemory: 2,
            producerInputCostPassThrough: 3,
            marketBalance: 8,
            adjustmentLag: -3,
            explicitOverride: 0,
          },
        }),
      ],
    };
    render(
      <InputsOutputsPanel
        commodities={attributed}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );
    fireEvent.focus(screen.getByText("Advertising & Media").parentElement!);
    expect(screen.getByText(/Global price drivers: inflation \+10/)).toBeTruthy();
    expect(screen.getByText(/country and regional conditions set the local price/)).toBeTruthy();
  });

  it("reports what prices cost through the input bill, not a margin modifier (ticket 1448)", () => {
    // The legacy commodity modifier read +6.1% on a plant whose inputs ate 59.6%
    // of revenue. Under plants it moves no money, so it is not shown.
    const withPnl = {
      ...plants,
      pnl: { revenueAnchor: 1_768_578.76, inputsAnchor: 1_054_772.78 },
    } as PlantsData;
    render(
      <InputsOutputsPanel
        commodities={{ ...commodities, commodityMarginModifier: 6.1 }}
        plants={withPnl}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.queryByText(/Net effect of prices/)).toBeNull();
    expect(screen.getByText("Your input bill, as a share of sales revenue")).toBeTruthy();
    expect(screen.getByText("59.6%")).toBeTruthy();
  });

  it("shows last turn's real amounts and sale price, so units x price matches the money panel (ticket 1448)", () => {
    // Nameplate rows: 10 + 5 units at billed 100 and 200 = 2,000 of inputs, 4
    // vehicles at a market 1,000. The plant actually ran at 90%: the booked
    // input bill was 1,800 and it made 3.6 vehicles, sold at 950 on average.
    const io: CommoditiesData = {
      supplies: [
        flow({
          commodity: "vehicles",
          label: "Vehicles & Machinery",
          icon: "Ve",
          units: 4,
          marketPrice: 1_000,
        }),
      ],
      demands: [
        flow({
          commodity: "steel",
          label: "Steel & Metals",
          icon: "Fe",
          units: 10,
          billedUnitPrice: 100,
        }),
        flow({
          commodity: "plastics",
          label: "Plastics & Polymers",
          icon: "Pl",
          units: 5,
          billedUnitPrice: 200,
        }),
      ],
      commodityMarginModifier: 0,
    };
    const ran = {
      fillRate: 1,
      producedUnits: 3.6,
      pnl: { revenueAnchor: 3_420, inputsAnchor: 1_800, avgSalePriceAnchor: 950 },
    } as PlantsData;
    render(
      <InputsOutputsPanel
        commodities={io}
        plants={ran}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );
    const row = (label: string) => screen.getByText(label).closest("li")!;
    expect(within(row("Steel & Metals")).getByText("9")).toBeTruthy();
    expect(within(row("Plastics & Polymers")).getByText("4.5")).toBeTruthy();
    expect(within(row("Vehicles & Machinery")).getByText("3.6")).toBeTruthy();
    expect(within(row("Vehicles & Machinery")).getByText(/950/)).toBeTruthy();
    expect(within(row("Vehicles & Machinery")).queryByText(/1,000/)).toBeNull();
  });
});

describe("sold share beside own-site use", () => {
  it("shows the own-site value next to the sold share", () => {
    render(
      <InputsOutputsPanel
        commodities={{
          ...commodities,
          supplies: [
            flow({
              commodity: "advertising",
              label: "Advertising & Media",
              icon: "Ad",
              soldFraction: 0.7,
              ownSite: { units: 30, share: 0.3, valueAnchor: 1234 },
            }),
          ],
        }}
        plants={plants}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );
    expect(screen.getByText(/70% sold · .*worth about .*1,?234.* to your sites/)).toBeTruthy();
  });
});

describe("short input rows", () => {
  const healthcare: CommoditiesData = {
    supplies: [],
    demands: [
      flow({
        commodity: "pharmaceuticals",
        label: "Pharmaceuticals",
        icon: "Rx",
        inputAvailability: 1,
      }),
      flow({
        commodity: "real_estate_services",
        label: "Real Estate Services",
        icon: "RE",
        inputAvailability: 0.286,
      }),
    ],
    commodityMarginModifier: 0,
    throughput: { bindingInput: "real_estate_services", applied: 0.286, projected: 0.286 },
  };
  const idlePlants = {
    fillRate: 0.39,
    capacityUnits: 2470,
    producedUnits: 967.56,
    idleCauses: [{ cause: "inputs", units: 1502 }],
  } as PlantsData;
  const renderPanel = (c: CommoditiesData, p: PlantsData) =>
    render(
      <InputsOutputsPanel
        commodities={c}
        plants={p}
        countryId="US"
        isExtraction={false}
        forexEnabled={false}
        exchangeRates={{}}
      />
    );

  it("marks only the input that ran short and links its sellers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true, offers: [{ side: "sell", own: false }] }),
      })
    );
    const { container } = renderPanel(healthcare, idlePlants);
    const marked = container.querySelectorAll("[data-short-input]");
    expect(Array.from(marked).map((n) => n.getAttribute("data-short-input"))).toEqual([
      "real_estate_services",
    ]);
    expect(within(marked[0] as HTMLElement).getByText("Ran short")).toBeTruthy();
    const link = await within(marked[0] as HTMLElement).findByText("1 seller offering");
    expect(link.getAttribute("href")).toBe("/commodity/real_estate_services/offers");
  });

  it("marks the engine's binding input when the world market shows full cover", () => {
    const c: CommoditiesData = {
      ...healthcare,
      demands: healthcare.demands.map((d) => ({ ...d, inputAvailability: 1 })),
    };
    const { container } = renderPanel(c, idlePlants);
    expect(container.querySelector("[data-short-input='real_estate_services']")).not.toBeNull();
    expect(container.querySelector("[data-short-input='pharmaceuticals']")).toBeNull();
  });

  it("says so when inputs stopped the run but no input row is short", () => {
    const c: CommoditiesData = {
      ...healthcare,
      demands: healthcare.demands.map((d) => ({ ...d, inputAvailability: 1 })),
      throughput: { bindingInput: null, applied: null, projected: 1 },
    };
    const { container } = renderPanel(c, idlePlants);
    expect(container.querySelector("[data-short-input]")).toBeNull();
    expect(container.querySelector("[data-unmarked-input-stop]")).not.toBeNull();
  });

  it("marks nothing and stays quiet when no input ran short", () => {
    const c: CommoditiesData = {
      ...healthcare,
      demands: healthcare.demands.map((d) => ({ ...d, inputAvailability: 1 })),
      throughput: { bindingInput: null, applied: 1, projected: 1 },
    };
    const { container } = renderPanel(c, { fillRate: 1 } as PlantsData);
    expect(container.querySelector("[data-short-input]")).toBeNull();
    expect(container.querySelector("[data-unmarked-input-stop]")).toBeNull();
  });
});
