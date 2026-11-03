import { describe, expect, it } from "vitest";
import {
  FISCAL_SCALE_HISTORY_TURNS,
  FISCAL_SCALE_MAX_MOVE,
  FISCAL_SCALE_SMOOTHING_TURNS,
  fiscalScaleLogLine,
  fiscalScaleStageActive,
  nextFiscalScale,
  normalizeFiscalScaleStage,
  scaledAmount,
  settlementValueAddedAnchor,
} from "./fiscalScale";

// Book GDP 48,000 a year is 1,000 a turn.
const BOOK = 48_000;

describe("fiscal scale stage", () => {
  it("treats unset, junk and negatives as off and clamps to the last stage", () => {
    expect(normalizeFiscalScaleStage(undefined)).toBe(0);
    expect(normalizeFiscalScaleStage("2")).toBe(0);
    expect(normalizeFiscalScaleStage(-1)).toBe(0);
    expect(normalizeFiscalScaleStage(2.7)).toBe(2);
    expect(normalizeFiscalScaleStage(99)).toBe(3);
    expect(fiscalScaleStageActive(undefined, 1)).toBe(false);
    expect(fiscalScaleStageActive(1, 1)).toBe(true);
  });
});

describe("nextFiscalScale", () => {
  it("starts at the first observed output over book GDP per turn, uncapped", () => {
    const s = nextFiscalScale(null, { turn: 10, fundedOutputLocal: 5, bookGdpAnnualLocal: BOOK });
    expect(s).toMatchObject({ turn: 10, scale: 0.005, rawScale: 0.005, capped: false });
    expect(s?.source).toBe("observed");
    expect(s?.history).toEqual([{ turn: 10, scale: 0.005 }]);
  });

  it("smooths output over twelve turns and caps the move per turn", () => {
    const first = nextFiscalScale(null, {
      turn: 10,
      fundedOutputLocal: 10,
      bookGdpAnnualLocal: BOOK,
    })!;
    // Output jumps tenfold: the average moves one twelfth of the gap.
    const second = nextFiscalScale(first, {
      turn: 11,
      fundedOutputLocal: 100,
      bookGdpAnnualLocal: BOOK,
    })!;
    expect(second.smoothedFundedOutputLocal).toBeCloseTo(10 + 90 / FISCAL_SCALE_SMOOTHING_TURNS);
    expect(second.rawScale).toBeCloseTo(0.0175);
    expect(second.scale).toBeCloseTo(0.01 * (1 + FISCAL_SCALE_MAX_MOVE));
    expect(second.capped).toBe(true);
  });

  it("caps a fall the same way", () => {
    const first = nextFiscalScale(null, {
      turn: 10,
      fundedOutputLocal: 100,
      bookGdpAnnualLocal: BOOK,
    })!;
    // Book GDP grows fivefold: the raw scale drops to a fifth, the stored one by the cap.
    const second = nextFiscalScale(first, {
      turn: 11,
      fundedOutputLocal: 100,
      bookGdpAnnualLocal: BOOK * 5,
    })!;
    expect(second.rawScale).toBeCloseTo(0.02);
    expect(second.scale).toBeCloseTo(0.1 / (1 + FISCAL_SCALE_MAX_MOVE));
    expect(second.capped).toBe(true);
  });

  it("carries the last value when output or book GDP is missing", () => {
    const first = nextFiscalScale(null, {
      turn: 10,
      fundedOutputLocal: 10,
      bookGdpAnnualLocal: BOOK,
    })!;
    const missing = nextFiscalScale(first, {
      turn: 11,
      fundedOutputLocal: null,
      bookGdpAnnualLocal: BOOK,
    })!;
    expect(missing).toMatchObject({ turn: 11, scale: 0.01, source: "carried" });
    expect(missing.smoothedFundedOutputLocal).toBe(10);
    const noBook = nextFiscalScale(first, {
      turn: 11,
      fundedOutputLocal: 10,
      bookGdpAnnualLocal: 0,
    })!;
    expect(noBook).toMatchObject({ scale: 0.01, source: "carried" });
    expect(
      nextFiscalScale(null, { turn: 1, fundedOutputLocal: null, bookGdpAnnualLocal: BOOK })
    ).toBeNull();
  });

  it("is idempotent within a turn", () => {
    const first = nextFiscalScale(null, {
      turn: 10,
      fundedOutputLocal: 10,
      bookGdpAnnualLocal: BOOK,
    })!;
    expect(
      nextFiscalScale(first, { turn: 10, fundedOutputLocal: 999, bookGdpAnnualLocal: BOOK })
    ).toBe(first);
  });

  it("restarts after a stale or rewound state, and never exceeds the books", () => {
    const old = nextFiscalScale(null, {
      turn: 10,
      fundedOutputLocal: 10,
      bookGdpAnnualLocal: BOOK,
    })!;
    const restarted = nextFiscalScale(old, {
      turn: 200,
      fundedOutputLocal: 5_000,
      bookGdpAnnualLocal: BOOK,
    })!;
    expect(restarted.scale).toBe(1);
    expect(restarted.capped).toBe(false);
    expect(
      nextFiscalScale(old, { turn: 5, fundedOutputLocal: 20, bookGdpAnnualLocal: BOOK })!.scale
    ).toBeCloseTo(0.02);
  });

  it("keeps a bounded history", () => {
    let s = nextFiscalScale(null, { turn: 1, fundedOutputLocal: 10, bookGdpAnnualLocal: BOOK });
    for (let t = 2; t <= 100; t++)
      s = nextFiscalScale(s, { turn: t, fundedOutputLocal: 10, bookGdpAnnualLocal: BOOK });
    expect(s!.history).toHaveLength(FISCAL_SCALE_HISTORY_TURNS);
    expect(s!.history.at(-1)?.turn).toBe(100);
  });
});

describe("helpers", () => {
  it("values a settlement as revenue less inputs consumed, never negative", () => {
    expect(settlementValueAddedAnchor({ revenue: 10, inputsConsumed: 4 })).toBe(6);
    expect(settlementValueAddedAnchor({ revenue: 1, inputsConsumed: 4 })).toBe(0);
  });

  it("scales book money and pays nothing without a usable scale", () => {
    expect(scaledAmount(1_000, 0.01)).toBe(10);
    expect(scaledAmount(1_000, null)).toBe(0);
    expect(scaledAmount(1_000, 5)).toBe(1_000);
    expect(scaledAmount(-5, 0.5)).toBe(0);
  });

  it("logs one sorted line with cap and carry markers", () => {
    const a = nextFiscalScale(null, { turn: 3, fundedOutputLocal: 10, bookGdpAnnualLocal: BOOK })!;
    const line = fiscalScaleLogLine(3, 1, [
      { countryId: "US", state: a },
      { countryId: "PL", state: { ...a, capped: true, source: "carried" } },
    ]);
    expect(line).toBe("[fiscalScale] t3 stage=1 n=2 PL=1.00e-2^~ US=1.00e-2");
  });
});
