import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HeroCard from "./HeroCard";
import { siteStatement } from "@/lib/corporations/rules/siteStatement";
import type { Financials, SectorData, Market } from "../types";
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `M${n}`, toInternalFrom: (n: number) => n }),
}));

it.each([0, 4800])(
  "uses the same site revenue, profit and margin as the money panel, income %s",
  (income) => {
    const statement = siteStatement({ turn: 12, revenue: 0, totalCost: 2400, income });
    const html = renderToStaticMarkup(
      <HeroCard
        sector={
          {
            stateId: "test",
            stateName: "Test",
            sectorType: "manufacturing",
            sectorLabel: "Manufacturing",
          } as SectorData
        }
        corporation={{ _id: "corp", name: "Supplier", liquidCurrencyCode: "USD" }}
        ceo={null}
        market={{ marketShare: 10 } as Market}
        corpHref="/corporation/corp"
        stateHref="/state/test"
        financials={
          { revenue: 0, realizedRevenue: 0, profit: -2400, siteStatement: statement } as Financials
        }
        margins={{ effective: 0 } as never}
      />
    );
    expect(html).toContain(`M${income / 24}`);
    expect(html).toContain(`M${(income - 2400) / 24}`);
    expect(html).toContain("Net margin");
    expect(html).toContain(income ? "50.0%" : "n/a");
  }
);
