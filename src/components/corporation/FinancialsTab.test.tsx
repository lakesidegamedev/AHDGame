/** @vitest-environment happy-dom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FinancialsTab from "./FinancialsTab";
import type { CorporationDetail, Financials, FinancialFogMeta } from "./CorporationPageTypes";
import messages from "../../../messages/en/corporations.json";

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: keyof typeof messages.corporations.arrears, values?: { turn: number }) =>
      messages.corporations.arrears[key].replace("{turn}", String(values?.turn ?? "")),
}));

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `M${Math.round(n)}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("./GroupOverviewCard", () => ({ GroupOverviewCard: () => null }));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) =>
    ({ US: "United States", UK: "United Kingdom", JP: "Japan" })[id] ?? id,
}));

const financials = {
  totalRevenue: 128000,
  maintenanceCosts: 65900,
  laborCosts: 10800,
  freightCosts: 77700,
  freightIncome: 120,
  growthCosts: 0,
  marketingCosts: 22000,
  logisticsCosts: 1100,
  rdCosts: 19000,
  ceoSalaryCost: 0,
  pensionContributionCost: 0,
  pensionTopUpCost: 0,
  pensionSchemesInDeficit: 0,
  regulatoryBurden: 3500,
  operatingCosts: 200000,
  operatingIncome: -72000,
  federalTax: 0,
  stateTax: 0,
  federalTaxByCountry: {},
  bondInterestCost: 1100,
  bondCouponIncome: 0,
  dividendIncomeReceived: 0,
  governmentBondSubsidy: 0,
  imfFacilityPaymentDaily: 0,
  imfFacilityReceiptsDaily: 0,
  totalCosts: 201100,
  income: -73100,
  realizedIncome: -79500,
  realizedDividendPaid: 0,
  realizedIncomeTurn: 23,
  dividendDistribution: 0,
  currentGrowthRate: 0,
} as Financials;

describe("corporation income statement", () => {
  it("shows arrears separately without annualizing the balance or last-turn payment", () => {
    const props = {
      corporation: { countryId: "US", liquidCurrencyCode: "USD" } as CorporationDetail,
      financials: { ...financials, arrears: { turn: 23, paidLastTurn: 123, remaining: 456 } },
      balanceSheet: null,
      bondInfo: null,
      corpId: "test",
      periodView: "daily" as const,
      onPeriodViewChange: vi.fn(),
      sectors: [],
    };
    const view = render(<FinancialsTab {...props} />);
    expect(screen.getByText("Arrears paid last turn")).toBeTruthy();
    expect(screen.getByText("Arrears remaining")).toBeTruthy();
    expect(screen.getByText("M123")).toBeTruthy();
    expect(screen.getByText("M456")).toBeTruthy();
    view.rerender(<FinancialsTab {...props} periodView="annual" />);
    expect(screen.getByText("M123")).toBeTruthy();
    expect(screen.getByText("M456")).toBeTruthy();
    view.rerender(<FinancialsTab {...props} periodView="turn" />);
    expect(screen.getByText("M123")).toBeTruthy();
    expect(screen.getByText("M456")).toBeTruthy();
    view.rerender(<FinancialsTab {...props} financialFogOfWar={{} as FinancialFogMeta} />);
    expect(screen.queryByText("Arrears remaining")).toBeNull();
    view.rerender(<FinancialsTab {...props} financials={financials} />);
    expect(screen.queryByText("Arrears remaining")).toBeNull();
  });
  it("shows the estimate-to-recorded change before a retained loss", () => {
    render(
      <FinancialsTab
        corporation={{ countryId: "US", liquidCurrencyCode: "USD" } as CorporationDetail}
        financials={financials}
        balanceSheet={null}
        bondInfo={null}
        corpId="test"
        periodView="daily"
        onPeriodViewChange={vi.fn()}
        sectors={[]}
      />
    );
    expect(screen.getAllByText("Freight charges")).toHaveLength(2);
    expect(screen.getByText("Freight revenue")).toBeTruthy();
    expect(screen.getByText("Net income, current estimate")).toBeTruthy();
    expect(screen.getByText("Difference from current estimate")).toBeTruthy();
    expect(screen.getByText("-M6400")).toBeTruthy();
    expect(screen.getByText(/Current estimates use today's sectors and budgets/)).toBeTruthy();
  });
});

describe("income statement by country", () => {
  const country = (
    countryId: string,
    sectorCount: number,
    revenue: number,
    result: number,
    over: Record<string, number> = {}
  ) => ({
    countryId,
    sectorCount,
    revenue,
    freightIncome: 0,
    maintenanceCosts: 250,
    laborCosts: 150,
    freightCosts: 60,
    growthCosts: 0,
    regulatoryBurden: 20,
    federalTax: 40,
    stateTax: 15,
    result,
    ...over,
  });
  const byCountry = [
    country("US", 14, 640, 222),
    country("UK", 4, 182, 57),
    country("JP", 2, 72, -3),
  ];
  // The Cost mix sidebar stays corporation-wide, so read the statement itself.
  const statement = () =>
    screen.getByRole("heading", { name: "Income statement" }).closest("section")!;
  const show = (rows = byCountry) =>
    render(
      <FinancialsTab
        corporation={
          {
            _id: "c1",
            countryId: "US",
            liquidCurrencyCode: "USD",
            brandColor: "#3b82f6",
          } as CorporationDetail
        }
        financials={{ ...financials, byCountry: rows } as Financials}
        balanceSheet={null}
        bondInfo={null}
        corpId="test"
        periodView="daily"
        onPeriodViewChange={vi.fn()}
        sectors={[]}
      />
    );

  it("offers no country filter to a corporation in one country", () => {
    show([country("US", 3, 640, 222)]);
    expect(screen.queryByRole("combobox", { name: "Country" })).toBeNull();
    expect(screen.queryByRole("img", { name: /^Revenue by country/ })).toBeNull();
  });

  it("on All, draws revenue by country with each country's share and result", () => {
    show();
    expect(screen.getByRole("combobox", { name: "Country" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Revenue by country/ })).toBeTruthy();
    const table = screen.getByRole("table", { name: "Revenue by country" });
    const uk = within(table).getByRole("button", { name: "United Kingdom" }).closest("tr")!;
    expect(within(uk).getByText("4")).toBeTruthy();
    expect(within(uk).getByText("20.4%")).toBeTruthy();
    const jp = within(table).getByRole("button", { name: "Japan" }).closest("tr")!;
    expect(within(jp).getByText("-M3").className).toContain("text-error");
    // The whole-corporation statement is still there on All.
    expect(within(statement()).getByText("Marketing")).toBeTruthy();
  });

  it("narrows the statement to one country's own revenue and costs", () => {
    show();
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), {
      target: { value: "UK" },
    });
    expect(screen.queryByRole("img", { name: /^Revenue by country/ })).toBeNull();
    const s = statement();
    expect(within(s).getByText("Gross revenue, 4 plants")).toBeTruthy();
    expect(within(s).getByText("M182")).toBeTruthy();
    expect(within(s).getByText("Wages")).toBeTruthy();
    expect(within(s).getByText("Result in United Kingdom")).toBeTruthy();
    expect(within(s).getByText("+M57")).toBeTruthy();
    // Corporation-wide costs belong to no country.
    expect(within(s).queryByText("Marketing")).toBeNull();
    expect(within(s).getByText(/Corporation-wide costs/)).toBeTruthy();
  });

  it("selects a country from its row in the table", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Japan" }));
    expect((screen.getByRole("combobox", { name: "Country" }) as HTMLSelectElement).value).toBe(
      "JP"
    );
    expect(screen.getByText("Result in Japan")).toBeTruthy();
  });
});
