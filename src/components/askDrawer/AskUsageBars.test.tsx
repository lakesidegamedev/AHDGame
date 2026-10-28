// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AskUsageBars, AskUsageLine } from "./AskUsageBars";
import { AskUpgradeCard } from "./AskUpgradeCard";

const offer = {
  url: "https://www.patreon.com/cw/AHouseDividedGame/membership",
  currentLabel: "Player",
  tiers: [
    {
      key: "supporter",
      label: "Supporter",
      name: "Supporter",
      price: "$3.00/month",
      questions: 40,
      multiple: 2,
    },
    {
      key: "supporter-plus-plus",
      label: "Supporter++",
      name: "Champion",
      price: "$20.00/month",
      questions: 160,
      multiple: 8,
    },
  ],
};

describe("AskUsageBars", () => {
  const now = Date.UTC(2026, 9, 27, 12, 0);

  it("shows one energy bar, about how many questions are left, the week and a way to get more", () => {
    render(
      <AskUsageBars
        usage={{
          used: 15,
          limit: 20,
          remaining: 5,
          mcpUsed: 15,
          mcpLimit: 20,
          mcpRemaining: 5,
          resetAt: now + 90 * 60000,
          energy: {
            daily: {
              used: 15,
              limit: 20,
              remaining: 5,
              percentLeft: 25,
              resetAt: now + 90 * 60000,
            },
            weekly: {
              used: 38,
              limit: 100,
              remaining: 62,
              percentLeft: 62,
              // Monday 2 November 2026, 00:00 UTC.
              resetAt: Date.UTC(2026, 10, 2),
            },
            typicalLeft: 5,
            unit: "energy",
          },
        }}
        planLabel="Player"
        upgrade={offer}
        now={now}
      />
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText(/about 5 questions left today/)).toBeTruthy();
    expect(screen.getByText("This week: 62% left, refills Monday")).toBeTruthy();
    expect(screen.queryByText(/Live data/)).toBeNull();
    expect(screen.getByText(/Refills in 1h 30m/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get more" }).getAttribute("href")).toBe(offer.url);
  });

  it("falls back to the old daily fields from an older Ask server", () => {
    render(
      <AskUsageBars
        usage={{ used: 4, limit: 5, remaining: 1, resetAt: now + 60000 }}
        planLabel={null}
        upgrade={null}
        now={now}
      />
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20");
    expect(screen.getByText(/about 1 question left today/)).toBeTruthy();
    expect(screen.queryByText(/This week/)).toBeNull();
  });
});

describe("AskUsageLine", () => {
  it("reads as energy, never questions out of a count", () => {
    render(
      <AskUsageLine
        usage={{
          used: 6,
          limit: 20,
          remaining: 14,
          resetAt: 0,
          energy: {
            daily: { used: 6, limit: 20, remaining: 14, resetAt: 0 },
            weekly: { used: 90, limit: 100, remaining: 10, resetAt: 0 },
          },
        }}
        open={false}
        onToggle={() => undefined}
      />
    );
    expect(screen.getByRole("button").textContent).toContain("Energy 70%");
    // The weekly cap is lower than today's, so it sets the estimate.
    expect(screen.getByRole("button").textContent).toContain("about 10 questions left today");
  });
});

describe("AskUpgradeCard", () => {
  it("lists each higher tier in energy terms with its real price and links to Patreon", () => {
    render(<AskUpgradeCard offer={offer} />);
    expect(screen.getByText("Want more energy each day?")).toBeTruthy();
    expect(screen.getByText("$3.00/month")).toBeTruthy();
    expect(screen.getByText("Champion")).toBeTruthy();
    expect(screen.getByText("8x Player energy, about 160 questions a day")).toBeTruthy();
    expect(screen.queryByText(/live-data/)).toBeNull();
    expect(screen.getByRole("link", { name: "Support on Patreon" }).getAttribute("href")).toBe(
      offer.url
    );
  });
});
