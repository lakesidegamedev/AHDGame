// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AskUsageBars } from "./AskUsageBars";
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
      questions: 10,
      liveQuestions: 4,
    },
    {
      key: "supporter-plus-plus",
      label: "Supporter++",
      name: "Champion",
      price: "$20.00/month",
      questions: 40,
      liveQuestions: 10,
    },
  ],
};

describe("AskUsageBars", () => {
  it("shows questions and live data left with the reset time and a way to get more", () => {
    const now = Date.UTC(2026, 9, 27, 12, 0);
    render(
      <AskUsageBars
        usage={{
          used: 4,
          limit: 5,
          remaining: 1,
          mcpUsed: 0,
          mcpLimit: 2,
          mcpRemaining: 2,
          resetAt: now + 90 * 60000,
        }}
        planLabel="Player"
        upgrade={offer}
        now={now}
      />
    );
    expect(screen.getByText("Questions")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")[0].getAttribute("aria-valuenow")).toBe("4");
    expect(screen.getByText(/Resets in 1h 30m/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get more" }).getAttribute("href")).toBe(offer.url);
  });
});

describe("AskUpgradeCard", () => {
  it("lists each higher tier with its real price and links to Patreon", () => {
    render(<AskUpgradeCard offer={offer} />);
    expect(screen.getByText("$3.00/month")).toBeTruthy();
    expect(screen.getByText("Champion")).toBeTruthy();
    expect(screen.getByText("40 questions, 10 live-data questions a day")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Support on Patreon" }).getAttribute("href")).toBe(
      offer.url
    );
  });
});
