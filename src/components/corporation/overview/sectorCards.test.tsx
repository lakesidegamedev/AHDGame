/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectorCards } from "./SectorCards";
import type { SectorDetail } from "../CorporationPageTypes";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const sector = (over: Partial<SectorDetail>) =>
  ({
    _id: "s1",
    stateId: "PA",
    stateName: "Pennsylvania",
    sectorType: "steel",
    sectorLabel: "Steel",
    revenue: 14.2,
    profit: 1.76,
    effectiveProfitMargin: 12.4,
    marketSharePercent: 18.2,
    fillRate: 0.89,
    fillRateBand: "high",
    producedUnits: 40,
    capacityUnits: 100,
    ...over,
  }) as unknown as SectorDetail;

const fmt = (n: number) => `$${n.toFixed(1)}`;
const fmtSigned = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;

describe("SectorCards", () => {
  it("phone layout lists each sector as a card with its figures", () => {
    render(
      <SectorCards
        sectors={[
          sector({}),
          sector({
            _id: "s2",
            stateId: "WV",
            stateName: "West Virginia",
            profit: -0.09,
            effectiveProfitMargin: -2.4,
          }),
        ]}
        corpId="7"
        plantsMode
        fogged={false}
        fmt={fmt}
        fmtSigned={fmtSigned}
        scale={(n) => n}
        maxRevenue={14.2}
      />
    );
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Pennsylvania/ }).getAttribute("href")).toBe(
      "/corporation/7/sector/s1"
    );
    expect(screen.getByText("12.4%")).toBeTruthy();
    expect(screen.getByText("-$0.09")).toBeTruthy();
    expect(screen.getAllByText("Sold")).toHaveLength(2);
    expect(screen.getAllByText("40% used")).toHaveLength(2);
  });

  it("shows share instead of fill below plants, and n/a for hidden money", () => {
    render(
      <SectorCards
        sectors={[
          sector({
            revenue: undefined as unknown as number,
            profit: undefined as unknown as number,
          }),
        ]}
        corpId="7"
        plantsMode={false}
        fogged={false}
        fmt={fmt}
        fmtSigned={fmtSigned}
        scale={(n) => n}
        maxRevenue={0}
      />
    );
    expect(screen.getByText("Share")).toBeTruthy();
    expect(screen.getByText("18.2%")).toBeTruthy();
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  });
});
