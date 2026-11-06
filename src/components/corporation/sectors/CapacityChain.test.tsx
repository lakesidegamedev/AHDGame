import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacityChain } from "./CapacityChain";
import { siteStatement } from "@/lib/corporations/rules/siteStatement";
import type { SectorDetail } from "../CorporationPageTypes";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

it.each([0, 200])(
  "shows the row's statement in its expanded explanation, internal income %s",
  (income) => {
    const statement = siteStatement({ revenue: 0, totalCost: 100, income, ownSiteValue: 200 });
    const sector = {
      sectorType: "real_estate",
      plantCount: 1,
      capacityUnits: 10,
      producedUnits: 10,
      soldUnits: 0,
      profit: -100,
      managementProfit: income - 100,
      effectiveProfitMargin: 0,
      siteStatement: statement,
    } as SectorDetail;
    const html = renderToStaticMarkup(
      <CapacityChain
        sector={sector}
        realized={0}
        operatingProfit={0}
        fillAdjusted={50}
        deliveryLimited={null}
        isMothballed={false}
        fmtScaled={String}
        fmtMoney={String}
        scaleFactor={1}
        variant="block"
      />
    );
    expect(html).toContain(
      `Revenue</span><span class="tabular-nums text-success">${income}</span>`
    );
    expect(html).toContain(
      `Net profit</span><span class="tabular-nums ${income > 0 ? "text-success" : "text-error"}">${income - 100}</span>`
    );
    expect(html).toContain(income ? "50.0%" : "n/a: no revenue");
  }
);
