// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CentralBankPolicyStrip } from "./CentralBankPolicyStrip";
import type { ExchangeRateDisplay } from "@/app/country/[code]/forex/types";

function rate(band: NonNullable<ExchangeRateDisplay["interventionBand"]>): ExchangeRateDisplay {
  return {
    countryId: "UK" as never,
    currencyCode: "GBP",
    rate: 1,
    baseRate: 1,
    rateHistory: [],
    strengthVsBase: 0,
    interventionBand: band,
  } as ExchangeRateDisplay;
}

describe("CentralBankPolicyStrip", () => {
  it("says a reachable corridor is defended and how long it takes", () => {
    render(
      <CentralBankPolicyStrip
        rates={[
          rate({
            floor: 0.8,
            ceiling: 0.84,
            setAtTurn: 10,
            defending: true,
            turnsToReach: 40,
            unreachable: false,
            gapPct: 0.4,
          }),
        ]}
        currentTurn={12}
      />
    );
    expect(screen.getByText("Defending")).toBeTruthy();
    expect(screen.getByText(/40.0% away, about 40 turns/)).toBeTruthy();
    expect(screen.queryByText("Out of reach")).toBeNull();
  });

  it("surfaces a corridor beyond a game year of defence as out of reach", () => {
    render(
      <CentralBankPolicyStrip
        rates={[
          rate({
            floor: 0.5,
            ceiling: 0.5,
            setAtTurn: 10,
            defending: true,
            turnsToReach: 50,
            unreachable: true,
            gapPct: 0.5,
          }),
        ]}
        currentTurn={12}
      />
    );
    expect(screen.getByText("Out of reach")).toBeTruthy();
    expect(screen.getByText(/Even a game year of maximum-strength defence/)).toBeTruthy();
  });

  it("does not add a countdown once the rate is in band", () => {
    render(
      <CentralBankPolicyStrip
        rates={[
          rate({
            floor: 1,
            ceiling: 1.2,
            setAtTurn: 10,
            defending: false,
            turnsToReach: 0,
            unreachable: false,
            gapPct: 0,
          }),
        ]}
        currentTurn={12}
      />
    );
    expect(screen.getByText("In band")).toBeTruthy();
    expect(screen.queryByText(/away/)).toBeNull();
  });
});
