/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CreditRatingTab from "./CreditRatingTab";
import type { BondInfo, CorporationDetail } from "./CorporationPageTypes";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (value: number) => String(value),
    toInternalFrom: (value: number) => value,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const corporation = {
  liquidCapital: 50_000,
  liquidCurrencyCode: "USD",
} as CorporationDetail;

const baseBondInfo = {
  bonds: [],
  imfFacility: null,
  totalDebt: 0,
  isCeo: false,
  cooldownTurnsRemaining: 0,
  currentTurn: 10,
} as unknown as BondInfo;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
});

describe("CreditRatingTab", () => {
  it("renders a fallback for rating-only private bond data", () => {
    render(
      <CreditRatingTab
        bondInfo={{ ...baseBondInfo, creditRating: { rating: "AAA" } } as BondInfo}
        bondLoading={false}
        corporation={corporation}
        corpId="corp-1"
      />
    );

    expect(screen.getByText("Credit rating data not available.")).toBeTruthy();
  });

  it("shows n/a for missing coupon figures in an otherwise complete rating", () => {
    render(
      <CreditRatingTab
        bondInfo={
          {
            ...baseBondInfo,
            creditRating: {
              rating: "AAA",
              compositeScore: 92,
              components: {
                debtToEquity: 100,
                interestCoverage: 100,
                profitability: 80,
                liquidity: 90,
              },
            },
          } as BondInfo
        }
        bondLoading={false}
        corporation={corporation}
        corpId="corp-1"
      />
    );

    expect(screen.getByText("Leverage rating")).toBeTruthy();
    expect(screen.getByText("n/a")).toBeTruthy();
  });

  const rated = {
    ...baseBondInfo,
    creditRating: {
      rating: "BBB",
      compositeScore: 61,
      effectiveCouponRate: 6.25,
      components: { debtToEquity: 60, interestCoverage: 60, profitability: 60, liquidity: 60 },
    },
  } as BondInfo;

  it("marks the rating on the full scale in the leverage section", () => {
    render(
      <CreditRatingTab bondInfo={rated} bondLoading={false} corporation={corporation} corpId="c" />
    );
    const scale = screen.getByRole("img", { name: /Rating scale from AAA to CCC/ });
    expect(scale.querySelector("[data-active=true]")?.getAttribute("data-tier")).toBe("BBB");
  });

  it("lists this corporation as a You row beside the peer averages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.includes("credit-peer-stats")
            ? {
                ok: true,
                json: () =>
                  Promise.resolve({
                    countryId: "US",
                    sectorType: "energy",
                    you: { composite: 61, rating: "BBB" },
                    countryPeers: { n: 12, avgComposite: 55.5, avgNewIssueCouponPct: 6.8 },
                    sectorPeers: null,
                  }),
              }
            : { ok: false, json: () => Promise.resolve({}) }
        )
      )
    );
    render(
      <CreditRatingTab bondInfo={rated} bondLoading={false} corporation={corporation} corpId="c" />
    );
    const you = (await screen.findByText("You")).closest("tr")!;
    expect(within(you).getByText("61")).toBeTruthy();
    expect(within(you).getByText("6.25%")).toBeTruthy();
    const country = screen.getByText("Country average").closest("tr")!;
    expect(within(country).getByText("55.5")).toBeTruthy();
    expect(within(country).getByText("12")).toBeTruthy();
    const sector = screen.getByText("Sector average").closest("tr")!;
    expect(within(sector).getAllByText("n/a").length).toBeGreaterThan(0);
  });
});
