import { describe, expect, it } from "vitest";
import {
  NPP_ACQUISITION_PREMIUM_MULTIPLIER,
  acquisitionBlockedAsNewThisTurn,
  playerAcquisitionMinimumPrice,
  isNppAutoResolvableTarget,
  meetsNppAcquisitionThreshold,
  nppAcquisitionMinimumPrice,
} from "./rules";

describe("NPP acquisition rules (#217)", () => {
  it("uses a modest 10 percent premium", () => {
    expect(NPP_ACQUISITION_PREMIUM_MULTIPLIER).toBe(1.1);
    expect(nppAcquisitionMinimumPrice(1_000_000)).toBe(1_100_000);
  });

  it("rounds the asking price up so it never drops below value plus premium", () => {
    expect(nppAcquisitionMinimumPrice(1)).toBe(2);
    expect(nppAcquisitionMinimumPrice(999)).toBe(1099);
  });

  it("treats zero, negative, or non-finite valuations as a zero asking price", () => {
    expect(nppAcquisitionMinimumPrice(0)).toBe(0);
    expect(nppAcquisitionMinimumPrice(-500)).toBe(0);
    expect(nppAcquisitionMinimumPrice(Number.NaN)).toBe(0);
    expect(nppAcquisitionMinimumPrice(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("accepts exactly at the threshold and rejects one unit below", () => {
    const valuation = 1_000_000;
    const asking = nppAcquisitionMinimumPrice(valuation);
    expect(meetsNppAcquisitionThreshold(asking, valuation)).toBe(true);
    expect(meetsNppAcquisitionThreshold(asking - 1, valuation)).toBe(false);
    expect(meetsNppAcquisitionThreshold(asking + 1, valuation)).toBe(true);
  });

  it("rejects non-finite offer prices", () => {
    expect(meetsNppAcquisitionThreshold(Number.NaN, 1_000_000)).toBe(false);
    expect(meetsNppAcquisitionThreshold(Number.POSITIVE_INFINITY, 1_000_000)).toBe(false);
  });

  it("auto-resolves only genuinely AI-run targets", () => {
    expect(isNppAutoResolvableTarget({ ceoType: "npp" })).toBe(true);
    // Caretaker-run corps stay player property: human flow, not auto-resolve.
    expect(isNppAutoResolvableTarget({ ceoType: "npp", caretakerCeo: { foo: 1 } })).toBe(false);
    expect(isNppAutoResolvableTarget({ ceoType: "character" })).toBe(false);
    expect(isNppAutoResolvableTarget({ ceoType: "imperial" })).toBe(false);
    expect(isNppAutoResolvableTarget({})).toBe(false);
  });
});

describe("player-run acquisition guards", () => {
  it("floors the price at the target's cash plus its other assets", () => {
    expect(playerAcquisitionMinimumPrice({ cashAnchor: 20_000_000, otherAssetsAnchor: 0 })).toBe(
      20_000_000
    );
    expect(playerAcquisitionMinimumPrice({ cashAnchor: 1_000.4, otherAssetsAnchor: 2_000 })).toBe(
      3_001
    );
  });

  it("never lets negative or missing parts lower the floor", () => {
    expect(playerAcquisitionMinimumPrice({ cashAnchor: -500, otherAssetsAnchor: NaN })).toBe(0);
  });

  it("blocks a company founded or floated this turn", () => {
    expect(acquisitionBlockedAsNewThisTurn({ foundedAtTurn: 536 }, 536)).toBe(true);
    expect(acquisitionBlockedAsNewThisTurn({ foundedAtTurn: 500, lastIpoTurn: 536 }, 536)).toBe(
      true
    );
    expect(acquisitionBlockedAsNewThisTurn({ foundedAtTurn: 535, lastIpoTurn: 535 }, 536)).toBe(
      false
    );
    expect(acquisitionBlockedAsNewThisTurn({}, 536)).toBe(false);
  });
});

describe("net asset acquisition floor", () => {
  it("keeps the same floor when cash is moved into investments", () => {
    expect(
      playerAcquisitionMinimumPrice({
        cashAnchor: 0,
        otherAssetsAnchor: 0,
        portfolioAnchor: 20_000_000,
      })
    ).toBe(20_000_000);
  });
  it("deducts assumed liabilities and includes bank residual equity", () => {
    expect(
      playerAcquisitionMinimumPrice({
        cashAnchor: 5_000_000,
        otherAssetsAnchor: 3_000_000,
        portfolioAnchor: 2_000_000,
        bankEquityAnchor: 4_000_000,
        debtAnchor: 12_000_000,
      })
    ).toBe(2_000_000);
    expect(
      playerAcquisitionMinimumPrice({ cashAnchor: 1_000, otherAssetsAnchor: 0, debtAnchor: 2_000 })
    ).toBe(0);
  });
});
