/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CommoditiesTab from "./CommoditiesTab";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (amount: number) => `$${Math.round(amount)}` }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        clearingEnabled: true,
        ledgerEnabled: true,
        supplyAgreementsEnabled: true,
        commodities: [
          {
            commodity: "energy",
            label: "Energy",
            icon: "EN",
            color: "bg-yellow-500",
            unit: "MWh",
            outputUnits: 0,
            consumptionUnits: 100,
            netUnits: -100,
            market: {
              basis: "ledger_aggregate",
              clearingBasis: "global_pooled_availability",
              price: 50,
              stockUnits: null,
              coverTurns: null,
              spoiledUnits: null,
              surplusUnits: null,
              unmetDemandUnits: null,
              surplusUnitsPooled: null,
              unmetDemandUnitsPooled: null,
            },
            privateSupply: {
              contractedUnits: 80,
              deliveredUnits: 60,
              consumptionCoveredUnits: 60,
              coveragePercent: 60,
              turn: 296,
              consumptionUnits: 100,
            },
          },
        ],
        regions: [],
        marketShare: [],
      }),
    })
  );
});

describe("CommoditiesTab private supply", () => {
  it("shows the buyer how much consumption its agreements actually delivered", async () => {
    render(<CommoditiesTab corpId="buyer" isCeo />);

    await waitFor(() => expect(screen.getByText("Energy")).toBeTruthy());
    expect(screen.getByText("Private supply")).toBeTruthy();
    expect(screen.getByText(/60 of 100 MWh consumed came from private supply/)).toBeTruthy();
    expect(screen.getByText(/40 MWh came from the open market or other sources/)).toBeTruthy();
    expect(screen.getByText(/Delivered on turn 296/)).toBeTruthy();
    expect(screen.getByText(/60% covered/)).toBeTruthy();
    expect(screen.getByText(/Contracted cap: 80 MWh/)).toBeTruthy();
    expect(screen.getByText(/Scarce supplier output is divided proportionally/)).toBeTruthy();
    expect(
      screen.getByText(/Net production is this corporation's own output minus its input use/)
    ).toBeTruthy();
  });

  it("reconciles private delivery with consumption and the prior turn", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        clearingEnabled: true,
        ledgerEnabled: true,
        supplyAgreementsEnabled: true,
        commodities: [
          {
            commodity: "advertising",
            label: "Advertising & Media",
            icon: "AD",
            color: "bg-pink-500",
            unit: "campaigns",
            outputUnits: 0,
            consumptionUnits: 5_130_654,
            netUnits: -5_130_654,
            market: { price: 8 },
            privateSupply: {
              contractedUnits: 4_000_000,
              deliveredUnits: 519_229,
              consumptionCoveredUnits: 519_229,
              coveragePercent: 10.12,
              turn: 362,
              consumptionUnits: 5_130_654,
              previousDeliveredUnits: 0,
              previousConsumptionUnits: 5_081_983,
              previousTurn: 361,
            },
          },
        ],
        regions: [],
        marketShare: [],
      }),
    } as Response);

    render(<CommoditiesTab corpId="624" isCeo />);

    await waitFor(() => expect(screen.getByText("Advertising & Media")).toBeTruthy());
    expect(screen.getByText("Net production")).toBeTruthy();
    expect(
      screen.getByText(/519,229 of 5,130,654 campaigns consumed came from private supply/)
    ).toBeTruthy();
    expect(
      screen.getByText(/4,611,425 campaigns came from the open market or other sources/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Previous turn 361: 0 delivered against 5,081,983 consumed/)
    ).toBeTruthy();
  });

  it("links supply-deal actions to the Commodities tab where the form lives", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        clearingEnabled: true,
        supplyAgreementsEnabled: true,
        commodities: [
          {
            commodity: "freight",
            label: "Freight",
            icon: "FR",
            color: "bg-sky-500",
            unit: "units",
            outputUnits: 100,
            consumptionUnits: 0,
            netUnits: 100,
            market: {},
          },
        ],
        regions: [],
        marketShare: [],
      }),
    } as Response);

    render(<CommoditiesTab corpId="604" isCeo />);

    const link = await screen.findByRole("link", { name: "Supply deal" });
    expect(link.getAttribute("href")).toBe("/corporation/604?tab=commodities#supply-agreements");
    expect(screen.getByRole("link", { name: "Supply agreements" }).getAttribute("href")).toBe(
      "/corporation/604?tab=commodities#supply-agreements"
    );
  });
});

describe("CommoditiesTab by region", () => {
  const flow = (
    commodity: string,
    label: string,
    unit: string,
    outputUnits: number,
    consumptionUnits: number,
    price: number | null
  ) => ({
    commodity,
    label,
    icon: "",
    color: "",
    unit,
    outputUnits,
    consumptionUnits,
    netUnits: outputUnits - consumptionUnits,
    market: { price },
  });

  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        clearingEnabled: false,
        commodities: [
          flow("steel", "Steel", "t", 1000, 0, 31),
          flow("iron_ore", "Iron ore", "t", 0, 500, 18),
          flow("coal", "Coal", "t", 0, 100, null),
        ],
        regions: [
          {
            stateId: "PA",
            stateName: "Pennsylvania",
            region: "Northeast",
            rows: [
              {
                commodity: "steel",
                label: "Steel",
                icon: "",
                outputUnits: 1000,
                consumptionUnits: 0,
              },
              {
                commodity: "iron_ore",
                label: "Iron ore",
                icon: "",
                outputUnits: 0,
                consumptionUnits: 500,
              },
              { commodity: "coal", label: "Coal", icon: "", outputUnits: 0, consumptionUnits: 100 },
            ],
          },
          { stateId: "NV", stateName: "Nevada", region: null, rows: [] },
          {
            stateId: "WV",
            stateName: "West Virginia",
            region: null,
            rows: [
              { commodity: "coal", label: "Coal", icon: "", outputUnits: 0, consumptionUnits: 50 },
            ],
          },
        ],
        marketShare: [],
      }),
    } as Response);
  });

  it("lists consumption before output in the flows table", async () => {
    render(<CommoditiesTab corpId="7" />);
    await screen.findByText("Pennsylvania");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.indexOf("Consumed")).toBeLessThan(headers.indexOf("Output"));
    expect(headers.indexOf("Consumes")).toBeLessThan(headers.indexOf("Produces"));
  });

  it("summarises each state collapsed, valued at market price", async () => {
    render(<CommoditiesTab corpId="7" />);
    const name = await screen.findByRole("button", { name: "Pennsylvania" });
    expect(name.getAttribute("aria-expanded")).toBe("false");
    const row = name.closest("tr")!;
    expect(within(row).getByText("Iron ore 500, Coal 100")).toBeTruthy();
    expect(within(row).getByText("Steel 1,000")).toBeTruthy();
    // Input cost counts only the priced line; coal has no market price.
    const cost = within(row).getByText("$9000");
    expect(cost.getAttribute("title")).toBe("Excludes commodities with no market price.");
    expect(within(row).getByText("$31000")).toBeTruthy();
    expect(within(row).getByText("+$22000")).toBeTruthy();
    expect(screen.queryByText("Inputs to Pennsylvania")).toBeNull();
  });

  it("opens a state into inputs on the left and outputs on the right", async () => {
    render(<CommoditiesTab corpId="7" />);
    fireEvent.click(await screen.findByRole("button", { name: "Pennsylvania" }));

    const inputsTitle = screen.getByText("Inputs to Pennsylvania");
    const outputsTitle = screen.getByText("Outputs from Pennsylvania");
    expect(
      inputsTitle.compareDocumentPosition(outputsTitle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const inputs = inputsTitle.parentElement!;
    expect(within(inputs).getByText("Iron ore")).toBeTruthy();
    expect(within(inputs).getByText("n/a")).toBeTruthy();
    const outputs = outputsTitle.parentElement!;
    expect(within(outputs).getByText("Steel")).toBeTruthy();
    expect(within(outputs).getByText("Output value")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: "Hide Pennsylvania inputs and outputs" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("commodities-region-PA");
    fireEvent.click(toggle);
    expect(screen.queryByText("Inputs to Pennsylvania")).toBeNull();
  });

  it("leaves money blank for a state whose only lines have no price", async () => {
    render(<CommoditiesTab corpId="7" />);
    const name = await screen.findByRole("button", { name: "West Virginia" });
    const cells = within(name.closest("tr")!).getAllByRole("cell");
    // State, Consumes, Produces, Input cost, Output value, Net value, toggle.
    expect(cells[1].textContent).toBe("Coal 50");
    expect(cells[3].textContent).toBe("");
    expect(cells[4].textContent).toBe("");
    expect(cells[5].textContent).toBe("");
    fireEvent.click(name);
    expect(screen.getByText("Produces nothing here.")).toBeTruthy();
  });

  it("offers no toggle for a state with nothing to show", async () => {
    render(<CommoditiesTab corpId="7" />);
    await screen.findByText("Nevada");
    expect(screen.queryByRole("button", { name: "Nevada" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nevada inputs and outputs/ })).toBeNull();
  });
});
