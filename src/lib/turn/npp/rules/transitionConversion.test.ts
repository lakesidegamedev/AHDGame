import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { AI_CONVERSION_MIN_SHORTAGE, chooseTransitionConversion } from "./transitionConversion";

const mismatched = {
  mismatched: true,
  legacyRevenueAnchor: 9,
  fundedRevenueAnchor: 1,
  basisTurns: 5,
};

function sector(over: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    stateId: "US-CA",
    countryId: "US",
    sectorType: "media",
    cutoverTransition: mismatched,
    ...over,
  } as CorporateSector;
}

const base = {
  turn: 12,
  firstFundedTurn: 10,
  allowedLanes: null,
  excludedSectorIds: new Set<string>(),
};

describe("AI transition conversion", () => {
  it("moves the worst loser into the shortest lane when the shortage is real", () => {
    const a = sector();
    const b = sector({ sectorType: "logistics" });
    const choice = chooseTransitionConversion({
      ...base,
      sectors: [a, b],
      incomeBySectorId: new Map([
        [a._id.toString(), -50],
        [b._id.toString(), -5],
      ]),
      shortageOf: (lane) => (lane === "healthcare" ? 1.6 : 0.8),
    });
    expect(choice).toEqual({ sectorId: a._id.toString(), lane: "healthcare" });
  });

  it("does nothing without a real shortage, for profitable sectors, or outside the window", () => {
    const a = sector();
    const losing = new Map([[a._id.toString(), -50]]);
    const weak = () => AI_CONVERSION_MIN_SHORTAGE - 0.01;
    expect(
      chooseTransitionConversion({
        ...base,
        sectors: [a],
        incomeBySectorId: losing,
        shortageOf: weak,
      })
    ).toBeNull();
    expect(
      chooseTransitionConversion({
        ...base,
        sectors: [a],
        incomeBySectorId: new Map([[a._id.toString(), 10]]),
        shortageOf: () => 2,
      })
    ).toBeNull();
    expect(
      chooseTransitionConversion({
        ...base,
        turn: 100,
        sectors: [a],
        incomeBySectorId: losing,
        shortageOf: () => 2,
      })
    ).toBeNull();
  });

  it("skips lanes the corporation runs in the state, extraction and disallowed lanes", () => {
    const a = sector();
    const existing = sector({ sectorType: "healthcare", cutoverTransition: undefined });
    const choice = chooseTransitionConversion({
      ...base,
      allowedLanes: new Set(["healthcare", "extraction", "energy"]),
      sectors: [a, existing],
      incomeBySectorId: new Map([[a._id.toString(), -50]]),
      shortageOf: (lane) =>
        lane === "healthcare" || lane === "extraction" ? 3 : lane === "energy" ? 1.3 : 0.5,
    });
    expect(choice).toEqual({ sectorId: a._id.toString(), lane: "energy" });
  });
});
