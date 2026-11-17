/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SupplyChainTab from "./SupplyChainTab";
import type { SupplyChainData } from "@/lib/corporations/supplyChain/types";
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (v: number) => `$${v}`,
    formatPrice: (v: number) => `$${v}`,
  }),
}));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) => ({ US: "United States", CA: "Canada" })[id] ?? id,
}));
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: () => {} }));
const ct = { id: "ct", countryId: "US", stateId: "CT", sectorType: "agriculture" };
const on = { id: "on", countryId: "CA", stateId: "CA_ON", sectorType: "agriculture" };
const data: SupplyChainData = {
  turn: 22,
  settledAt: null,
  sites: [ct, on],
  states: { CT: "Connecticut", CA_ON: "Ontario" },
  parties: [
    { id: "supplier", name: "Example Supplier", kind: "corporation", href: "/corporation/7" },
    { id: "own", name: "Own Company", kind: "corporation", href: "/corporation/1" },
    { id: "people", name: "Households", kind: "households" },
  ],
  flows: [
    {
      direction: "suppliers",
      mode: "open-market",
      site: ct,
      counterpartyId: "supplier",
      counterpartyCountry: "US",
      counterpartyState: "CT",
      commodity: "energy",
      units: 5,
      amount: 10,
    },
    {
      direction: "suppliers",
      mode: "open-market",
      site: on,
      counterpartyId: "supplier",
      counterpartyCountry: "US",
      counterpartyState: "CT",
      commodity: "energy",
      units: 10,
      amount: 20,
    },
    {
      direction: "suppliers",
      mode: "internal",
      site: on,
      counterpartyId: "own",
      counterpartyCountry: "US",
      counterpartyState: "CT",
      commodity: "food",
      units: 8,
      amount: 0,
    },
    {
      direction: "customers",
      mode: "agreement",
      site: ct,
      counterpartyId: "people",
      counterpartyCountry: "CA",
      counterpartyState: "CA_ON",
      commodity: "food",
      units: 10,
      amount: 50,
    },
  ],
};
const reply = (body: unknown = data, ok = true) => ({ ok, json: async () => body }) as Response;
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const suppliers = () => within(screen.getByRole("region", { name: "Suppliers" }));
describe("SupplyChainTab", () => {
  it("shows actual supplier links, customers and cash totals without counting internal deliveries", async () => {
    render(<SupplyChainTab corpId="1" />);
    await screen.findByText("Example Supplier");
    expect(screen.getByText("Example Supplier").closest("a")?.getAttribute("href")).toBe(
      "/corporation/7"
    );
    expect(screen.getByText("Households")).toBeTruthy();
    expect(suppliers().getByText("$30")).toBeTruthy();
    expect(suppliers().getAllByText("No cash payment")).toHaveLength(2);
    expect(screen.getByText(/Trade values exclude tariffs/)).toBeTruthy();
    expect(suppliers().getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Sector / location" }));
    expect(suppliers().getAllByRole("row")).toHaveLength(4);
    expect(suppliers().getByRole("columnheader", { name: "Your sector / location" })).toBeTruthy();
  });
  it("filters own country/state/type/site, separates trade types and clears dependent filters", async () => {
    render(<SupplyChainTab corpId="1" />);
    await screen.findByText("Example Supplier");
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "CA" } });
    expect(suppliers().getByText("$20")).toBeTruthy();
    expect(screen.getByText("No customers match these filters in this turn.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("State / region"), { target: { value: "CA_ON" } });
    fireEvent.change(screen.getByLabelText("Sector type"), { target: { value: "agriculture" } });
    fireEvent.change(screen.getByLabelText("Sector / location"), { target: { value: "on" } });
    fireEvent.change(screen.getByLabelText("Trade type"), { target: { value: "internal" } });
    expect(screen.queryByText("Example Supplier")).toBeNull();
    expect(suppliers().getByText("Own Company")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "US" } });
    expect((screen.getByLabelText("State / region") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Sector / location") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.getByText("Example Supplier")).toBeTruthy();
    expect(screen.getByText("Households")).toBeTruthy();
  });
  it("shows private-access errors and retries without caching a failed response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ error: "Management only" }, false));
    render(<SupplyChainTab corpId="1" modViewEnabled />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/corporations/1/supply-chain?modView=1",
      expect.objectContaining({ cache: "no-store" })
    );
    fireEvent.click(screen.getByText("Try again"));
    await screen.findByText("Example Supplier");
  });
  it("distinguishes a new world without settlement from a company without matching deliveries", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ...data, turn: null, flows: [] }));
    render(<SupplyChainTab corpId="1" />);
    await screen.findByText(/No completed market settlement/);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ...data, flows: [] }));
    fireEvent.click(screen.getByText("Refresh"));
    await screen.findByText("No suppliers match these filters in this turn.");
  });
  it("ignores a late response for a previously viewed corporation", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const ui = render(<SupplyChainTab corpId="old" />);
    ui.rerender(<SupplyChainTab corpId="new" />);
    await screen.findByText("Example Supplier");
    await act(async () => finish(reply({ ...data, turn: null })));
    await waitFor(() => expect(screen.queryByText(/No completed market settlement/)).toBeNull());
    expect(screen.getByText("Example Supplier")).toBeTruthy();
  });
  it("paginates large relationship lists and resets after a new completed turn", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      reply({
        ...data,
        flows: Array.from({ length: 30 }, (_, i) => ({
          ...data.flows[0],
          commodity: `item_${i}`,
          amount: i + 1,
        })),
      })
    );
    render(<SupplyChainTab corpId="1" />);
    await screen.findByText("Item 29");
    expect(suppliers().getAllByRole("row")).toHaveLength(26);
    fireEvent.click(suppliers().getByText("Next"));
    expect(suppliers().getByText("Page 2 of 2")).toBeTruthy();
    expect(suppliers().getByText("Item 0")).toBeTruthy();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ...data, turn: 23 }));
    fireEvent.click(screen.getByText("Refresh"));
    await screen.findByText("Example Supplier");
    expect(suppliers().queryByText("Page 2 of 2")).toBeNull();
  });
});
