// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/nav.json";
import { SidebarWidget } from "./SidebarWidget";
import { BarStrip, heatColor, toneOf, TrendSparkline } from "./MiniCharts";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

const w = en.nav.widgets;

function renderWidget(widgetKey: string, data: unknown, compact = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SidebarWidget widgetKey={widgetKey} data={data} loaded compact={compact} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("mini charts", () => {
  it("colours a trend by its direction and labels it", () => {
    expect(toneOf([1, 2])).toBe("up");
    expect(toneOf([2, 1])).toBe("down");
    expect(toneOf([3])).toBe("flat");
    render(<TrendSparkline values={[1, 3, 2, 4]} label="Trend" format={(v) => `v${v}`} area />);
    const chart = screen.getByRole("img", { name: "Trend" });
    expect(chart.getAttribute("class")).toContain("text-success");
    expect(chart.querySelectorAll("title")).toHaveLength(4);
    expect(chart.querySelector("path")).toBeTruthy();
  });

  it("draws nothing for a single point", () => {
    const { container } = render(<TrendSparkline values={[1]} label="One" />);
    expect(container.innerHTML).toBe("");
  });

  it("draws gains up and losses down from the zero line", () => {
    render(<BarStrip values={[5, -5, 0]} label="Income" height={20} />);
    const bars = screen.getByRole("img", { name: "Income" }).querySelectorAll("rect");
    expect(bars[0]!.getAttribute("class")).toBe("text-success");
    expect(bars[1]!.getAttribute("class")).toBe("text-error");
    expect(Number(bars[0]!.getAttribute("y"))).toBeLessThan(Number(bars[1]!.getAttribute("y")));
    expect(bars[2]!.getAttribute("height")).toBe("0");
  });

  it("mixes towards the gain or loss colour as a move grows", () => {
    expect(heatColor(0)).toBe("var(--card-muted, var(--card))");
    expect(heatColor(2)).toContain("var(--success)");
    expect(heatColor(-9)).toContain("var(--error) 50%");
  });
});

describe("graphical widgets", () => {
  it("adds a trend and a direction bar to every ticker row", () => {
    renderWidget("stockTicker:nyse", {
      exchange: "nyse",
      exchangeName: "NYSE",
      turn: 10,
      rows: [
        {
          sequentialId: 4,
          name: "Acme",
          ticker: "ACM",
          sharePrice: 11,
          currencyCode: "USD",
          change: 10,
          series: [9, 10, 11],
        },
      ],
    });
    expect(screen.getByRole("img", { name: "ACM share price over the last 3 turns" })).toBeTruthy();
    expect(screen.getByText("▲10.0%")).toBeTruthy();
  });

  it("charts share price, cash and income for my company, and keeps the menu version short", () => {
    const company = {
      sequentialId: 3,
      name: "Acme",
      ticker: "ACM",
      currencyCode: "USD",
      cash: 500,
      sharePrice: 12,
      sharePriceChange: 20,
      revenue: 90,
      income: -4,
      sharePriceSeries: [10, 12],
      cashSeries: [450, 500],
      incomeSeries: [6, -4],
      isPrivate: false,
    };
    renderWidget("myCompany", company);
    expect(screen.getByText("Last 2 turns")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Share price over the last 2 turns" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Cash over the last 2 turns" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Income per turn over the last 2 turns" })).toBeTruthy();
    cleanup();
    renderWidget("myCompany", company, true);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("lays out sector tiles that link to the exchange and name their move", () => {
    renderWidget("sectorHeatmap:nyse", {
      exchange: "nyse",
      exchangeName: "NYSE",
      turn: 10,
      tiles: [
        { type: "energy", label: "Energy", marketCap: 600, change: 2.5, listings: 3 },
        { type: "other", label: "other", marketCap: 400, change: -1, listings: 1 },
      ],
    });
    expect(screen.getByRole("region", { name: `${w.sectorHeatmap.title} · NYSE` })).toBeTruthy();
    const energy = screen.getByRole("link", { name: /^Energy: ▲2\.5% since last turn/ });
    expect(energy.getAttribute("href")).toBe("/stockmarket/nyse");
    expect(screen.getByRole("link", { name: /^Other: ▼1\.0%/ })).toBeTruthy();
    expect(energy.textContent).toContain("Energy");
  });

  it("shows net worth with its change since last turn and a trend", () => {
    renderWidget("netWorth", {
      currencyCode: "USD",
      points: [
        { turn: 1, value: 100, rate: null },
        { turn: 2, value: 110, rate: null },
      ],
    });
    expect(screen.getByRole("img", { name: "Net worth over the last 2 turns" })).toBeTruthy();
    expect(screen.getAllByText("▲10.0%")).toHaveLength(2);
    expect(screen.getByText(w.netWorth.sinceLastTurn)).toBeTruthy();
  });

  it("explains an empty net worth", () => {
    renderWidget("netWorth", null);
    expect(screen.getByText(w.netWorth.empty)).toBeTruthy();
  });

  it("lists commodities with trends linking to each commodity page", () => {
    renderWidget("commodityBoard", {
      turn: 30,
      rows: [
        {
          commodity: "oil",
          label: "Crude Oil",
          price: 50,
          change: -5,
          series: [52, 51, 50],
        },
      ],
    });
    const link = screen.getByRole("link", { name: /Crude Oil/ });
    expect(link.getAttribute("href")).toBe("/commodity/oil");
    expect(screen.getByRole("img", { name: "Crude Oil price over the last 3 turns" })).toBeTruthy();
    expect(screen.getByText("▼5.0%")).toBeTruthy();
  });
});
