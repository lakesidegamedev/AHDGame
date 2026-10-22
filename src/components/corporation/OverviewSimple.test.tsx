/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ATTENTION_TAG, OverviewSimple, type SimpleFigures } from "./OverviewSimple";
import type { SectorDetail } from "./CorporationPageTypes";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const figures: SimpleFigures = {
  revenue: "$48.2M",
  netIncome: { text: "+$4.4M", raw: 4.4 },
  netMargin: 9.1,
  growth: { value: 3.2, label: "Revenue growth", unit: "past year" },
  cash: { text: "$84.6M", raw: 84.6 },
  debt: { text: "$310.0M", rating: "A", bonds: 3 },
  sharePrice: "$42.18",
  marketCap: "cap $1.27B",
  fillPct: 84,
};

const sector = (id: string, name: string, revenue: number, profit: number) =>
  ({
    _id: id,
    stateId: id,
    stateName: name,
    sectorType: "steel",
    sectorLabel: "Steel",
    revenue,
    profit,
    effectiveProfitMargin: profit >= 0 ? 10 : -2.4,
    marketSharePercent: 12,
    fillRate: 0.8,
    fillRateBand: "high",
  }) as unknown as SectorDetail;

function renderSimple(overrides: Partial<React.ComponentProps<typeof OverviewSimple>> = {}) {
  const onTabChange = vi.fn();
  render(
    <OverviewSimple
      attention={[
        {
          key: "bond-due",
          tone: "error",
          title: "1 bond due within 48 turns",
          detail: "Next repayment in 4 turns.",
          tab: "credit",
        },
        { key: "votes", tone: "primary", title: "2 shareholder votes open", tab: "shares" },
      ]}
      figures={figures}
      sectors={[
        sector("PA", "Pennsylvania", 14.2, 1.76),
        sector("WV", "West Virginia", 3.8, -0.09),
      ]}
      corpId="7"
      periodView="turn"
      periodControl={null}
      fogged={false}
      fmt={(n) => `$${n}`}
      plantsMode
      scale={(n) => n}
      onTabChange={onTabChange}
      {...overrides}
    />
  );
  return { onTabChange };
}

describe("OverviewSimple", () => {
  it("every attention key has a tag word", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/corporation/overviewModel.ts"),
      "utf8"
    );
    const keys = [...source.matchAll(/key: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(ATTENTION_TAG[key], key).toBeTruthy();
  });

  it("tags attention items and opens their tab", () => {
    const { onTabChange } = renderSimple();
    expect(screen.getByText("Due")).toBeTruthy();
    expect(screen.getByText("Vote")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);
    expect(onTabChange).toHaveBeenCalledWith("credit");
  });

  it("glance shows eight figures", () => {
    renderSimple();
    for (const label of [
      "Revenue/turn",
      "Net income/turn",
      "Net margin",
      "Revenue growth",
      "Cash",
      "Debt",
      "Share price",
      "Output sold",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Leverage A")).toBeTruthy();
  });

  it("losing legend shows when a top sector loses money", () => {
    renderSimple();
    expect(screen.getByText(/Red edge: the sector is losing money/)).toBeTruthy();
  });

  it("says when nothing needs the reader", () => {
    renderSimple({ attention: [] });
    expect(screen.getByText("Nothing needs you right now.")).toBeTruthy();
  });
});
