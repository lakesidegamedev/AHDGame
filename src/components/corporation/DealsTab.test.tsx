/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DealsTab from "./DealsTab";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    // Anchor amounts print with the currency they are shown in; never a symbol.
    formatAmount: (n: number, code?: string) => `A${Math.round(n)}${code ? ` ${code}` : ""}`,
    formatFull: (n: number) => `A${n}`,
    formatPrice: (n: number) => `A${n}`,
    formatPriceOrder: (n: number) => `A${n}`,
    formatAmountChip: (n: number) => `A${n}`,
    formatListingPrice: (n: number) => `A${n}`,
    // One pound is two anchor units in these tests.
    toInternalFrom: (n: number, code?: string) => (code === "GBP" ? n * 2 : n),
  }),
}));
vi.mock("@/components/corporation/MergerReviewPanel", () => ({ default: () => null }));

const offer = (over: Record<string, unknown>) => ({
  offerId: "o1",
  acquirerCorporationId: "c1",
  acquirerName: "Keystone",
  targetCorporationId: "t1",
  targetName: "Target Co",
  priceAnchor: 1_100,
  targetValuationAnchor: 1_000,
  status: "pending",
  expiresAtTurn: 90,
  outcome: "merge",
  ...over,
});

let deals: Record<string, unknown>;
const fetchMock = vi.fn();

beforeEach(() => {
  deals = { enabled: true, subsidiaryAvailable: true, incoming: [], outgoing: [] };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const json = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });
    if (url.startsWith("/api/corporations/buyer-search"))
      return json({ results: [{ id: "t1", name: "Target Co", ticker: null, countryId: "GB" }] });
    if (url === "/api/corporations/t1")
      return json({
        corporation: { _id: "t1", name: "Target Co", headquartersStateName: "Wales" },
        // A private target: rows stay listed with their figures stripped.
        sectors: [{ _id: "a" }, { _id: "b" }, { _id: "c" }],
      });
    if (url === "/api/corporations/c1/deals")
      return init?.method === "POST" ? json({ ok: true }) : json(deals);
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function show() {
  return render(<DealsTab corpId="c1" isCeo liquidCapital={1_000} liquidCurrencyCode="GBP" />);
}

async function pickTarget() {
  fireEvent.change(await screen.findByLabelText("Target corporation"), {
    target: { value: "Tar" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Target Co/ }, { timeout: 2000 }));
}

describe("DealsTab", () => {
  it("offer typed in GBP posts the anchor amount", async () => {
    show();
    await pickTarget();
    fireEvent.change(screen.getByLabelText("Offer price"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1].body as string)).toMatchObject({
        action: "propose",
        targetCorporationId: "t1",
        priceAnchor: 1_000,
      });
    });
  });

  it("premium only with a valuation", async () => {
    deals.outgoing = [
      offer({ offerId: "o1", targetName: "Valued Co" }),
      offer({ offerId: "o2", targetName: "Unvalued Co", targetValuationAnchor: 0 }),
    ];
    show();
    const valued = (await screen.findByText("Valued Co")).closest("tr")!;
    expect(within(valued).getByText("+10.0%")).toBeTruthy();
    const unvalued = screen.getByText("Unvalued Co").closest("tr")!;
    expect(within(unvalued).queryByText(/%$/)).toBeNull();
  });

  it("no ₳ in the rendered tab", async () => {
    deals.incoming = [offer({ offerId: "i1", acquirerName: "Bidder" })];
    deals.outgoing = [offer({ offerId: "o1" })];
    const { container } = show();
    await screen.findByText("Bidder");
    await pickTarget();
    fireEvent.change(screen.getByLabelText("Offer price"), { target: { value: "1500" } });
    await screen.findByText("Wales");
    expect(container.textContent).not.toContain("₳");
  });

  it("preview shows sector count from redacted rows", async () => {
    show();
    await pickTarget();
    const preview = await screen.findByRole("region", { name: "Target Co preview" });
    expect(await within(preview).findByText("Wales")).toBeTruthy();
    expect(within(preview).getByText("3")).toBeTruthy();
    // Offer above cash shows what is still to find, in this corporation's currency.
    fireEvent.change(screen.getByLabelText("Offer price"), { target: { value: "1500" } });
    expect(within(preview).getByText("Short by")).toBeTruthy();
    expect(within(preview).getByText("A1000 GBP")).toBeTruthy();
  });
});
