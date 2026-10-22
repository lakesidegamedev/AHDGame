// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankFundsPanel } from "./BankFundsPanel";
import { FUND_MIN_SEED_CAPITAL_ANCHOR } from "@/lib/indexFunds/sponsorship/constants";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number, code?: string) => `A${Math.round(n)}${code ? ` ${code}` : ""}`,
    formatPrice: (n: number) => `P${n.toFixed(2)}`,
    formatFull: (n: number) => `A${n}`,
    formatPriceOrder: (n: number) => `P${n}`,
    formatAmountChip: (n: number) => `A${n}`,
    formatListingPrice: (n: number) => `P${n}`,
    // One pound is two anchor units in these tests.
    toInternalFrom: (n: number, code?: string) => (code === "GBP" ? n * 2 : n),
  }),
}));

const companyId = "000000000000000000000001";
const payload = {
  canCreate: true,
  countryId: "US",
  funds: [],
  stockChoices: [{ id: companyId, name: "Public Company", ticker: "PUB" }],
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => ({
    ok: true,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Bank Funds creation", () => {
  it("offers only implemented picked stocks and submits their total portfolio weights", async () => {
    render(<BankFundsPanel corporationId="bank" />);
    await screen.findByText(/Pick up to 10 companies/);
    expect(screen.queryByText("Automatic blend")).toBeNull();
    expect(screen.queryByText("Bonds")).toBeNull();
    fireEvent.change(screen.getByLabelText("Fund name"), {
      target: { value: "Domestic Selected Fund" },
    });
    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "PICK" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Public Company weight (%)"), {
      target: { value: "12.5" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create fund" }).closest("form")!);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/index-funds/charter", expect.anything())
    );
    const request = fetchMock.mock.calls.find((c) => c[0] === "/api/index-funds/charter")!;
    expect(JSON.parse((request[1] as RequestInit).body as string)).toMatchObject({
      scope: "country",
      kind: "broad",
      countryId: "US",
      pickedStocks: [{ corporationId: companyId, weightBps: 1250 }],
    });
  });
  it("hides creation and empty menus when the server refuses that viewer", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...payload, canCreate: false }) });
    const { container } = render(<BankFundsPanel corporationId="bank" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
  it("shows an existing fund link without exposing creation to visitors", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...payload,
        canCreate: false,
        funds: [
          { id: "fund", slug: "picked", name: "Selected Fund", status: "active", countryId: "US" },
        ],
      }),
    });
    render(<BankFundsPanel corporationId="bank" />);
    expect((await screen.findByRole("link", { name: "Selected Fund" })).getAttribute("href")).toBe(
      "/stockmarket/us/fund/picked"
    );
    expect(screen.queryByRole("button", { name: "Create fund" })).toBeNull();
  });

  it("no ₳ rendered, and the seed is typed in the bank's currency", async () => {
    const { container } = render(<BankFundsPanel corporationId="bank" liquidCurrencyCode="GBP" />);
    await screen.findByText(/Pick up to 10 companies/);
    expect(container.textContent).not.toContain("₳");
    expect(screen.getByText(/Bank seed investment, GBP/)).toBeTruthy();
  });

  it("posts the minimum seed exactly when left untouched and converts a typed one", async () => {
    const submit = async (seed?: string) => {
      fetchMock.mockClear();
      render(<BankFundsPanel corporationId="bank" liquidCurrencyCode="GBP" />);
      await screen.findByText(/Pick up to 10 companies/);
      fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: "Selected Fund" } });
      fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "PICK" } });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.change(screen.getByLabelText("Public Company weight (%)"), {
        target: { value: "10" },
      });
      if (seed)
        fireEvent.change(screen.getByLabelText("Bank's seed investment"), {
          target: { value: seed },
        });
      fireEvent.submit(screen.getByRole("button", { name: "Create fund" }).closest("form")!);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/index-funds/charter", expect.anything())
      );
      const request = fetchMock.mock.calls.find((c) => c[0] === "/api/index-funds/charter")!;
      cleanup();
      return JSON.parse((request[1] as RequestInit).body as string).seedCapitalAnchor;
    };
    expect(await submit()).toBe(FUND_MIN_SEED_CAPITAL_ANCHOR);
    expect(await submit(String(FUND_MIN_SEED_CAPITAL_ANCHOR))).toBe(
      FUND_MIN_SEED_CAPITAL_ANCHOR * 2
    );
  });
});
