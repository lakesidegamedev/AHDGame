/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SponsoredFundPanel from "./SponsoredFundPanel";
import { FUND_MIN_SEED_CAPITAL_ANCHOR } from "@/lib/indexFunds/sponsorship/constants";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
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
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: vi.fn().mockResolvedValue({ canCreate: true, funds: [] }),
}));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) => id,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const post = vi.fn();
beforeEach(() => {
  post.mockResolvedValue({ ok: true, json: async () => ({ slug: "alpha" }) });
  vi.stubGlobal("fetch", post);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  post.mockReset();
});

async function show() {
  const view = render(<SponsoredFundPanel corpId="c1" liquidCurrencyCode="GBP" countryId="UK" />);
  await screen.findByText("Charter a sponsored fund");
  fireEvent.change(screen.getByLabelText("Fund name"), { target: { value: "Alpha Index" } });
  fireEvent.change(screen.getByLabelText("Ticker (3 to 8 letters)"), { target: { value: "ALPH" } });
  fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "global" } });
  return view;
}

const body = () => JSON.parse(post.mock.calls[0][1].body as string);

describe("SponsoredFundPanel", () => {
  it("no ₳ rendered", async () => {
    const { container } = await show();
    expect(container.textContent).not.toContain("₳");
    expect(screen.getByLabelText("Seed capital, GBP")).toBeTruthy();
  });

  it("posts the minimum seed exactly when left untouched", async () => {
    await show();
    fireEvent.submit(screen.getByLabelText("Fund name").closest("form")!);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(body().seedCapitalAnchor).toBe(FUND_MIN_SEED_CAPITAL_ANCHOR);
  });

  it("converts a typed seed from the corporation currency to anchor", async () => {
    await show();
    const seedLocal = FUND_MIN_SEED_CAPITAL_ANCHOR; // twice the minimum once converted
    fireEvent.change(screen.getByLabelText("Seed capital, GBP"), {
      target: { value: String(seedLocal) },
    });
    fireEvent.submit(screen.getByLabelText("Fund name").closest("form")!);
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(body().seedCapitalAnchor).toBe(seedLocal * 2);
  });
});
