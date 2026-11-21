/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EconomyAtAGlance } from "./EconomyAtAGlance";

vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  [2.9, "+2.9% of GDP", "Budget surplus"],
  [-2.9, "-2.9% of GDP", "Budget deficit"],
])(
  "shows the signed budget balance %s and fractional debt ratio correctly",
  async (balance, label, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          countryId: "CA",
          pulse: {
            gdpGrowth: { value: null, history: [] },
            inflation: { value: null, target: 2, history: [] },
            primeRate: { value: null, neutral: 2.75, heldTurns: null, history: [] },
            credit: { debtToGdpRatio: 0.675 },
          },
          realEconomy: { unemployment: { value: null, trend: null } },
          markets: { deficitToGdp: balance },
        })
      )
    );

    render(<EconomyAtAGlance countryId="CA" />);

    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByText(new RegExp(status))).toBeTruthy();
    expect(screen.getByText("67.5%")).toBeTruthy();
  }
);
