import { describe, expect, it } from "vitest";
import {
  CASH_CUT_EVIDENCE_MAX_AGE_TURNS,
  corpHeldByCashCut,
  lastRunCutByCash,
} from "./cashCutHold";

const EPOCH = "epoch-1";

describe("lastRunCutByCash", () => {
  it("reads a fresh cash cut on the funded world", () => {
    expect(lastRunCutByCash({ worldEpoch: EPOCH, turn: 99, runCutBy: ["cash"] }, EPOCH, 100)).toBe(
      true
    );
    expect(
      lastRunCutByCash({ worldEpoch: EPOCH, turn: 100, runCutBy: ["cash", "inputs"] }, EPOCH, 100)
    ).toBe(true);
  });

  it("ignores input cuts, other worlds, stale and missing receipts", () => {
    expect(
      lastRunCutByCash({ worldEpoch: EPOCH, turn: 99, runCutBy: ["inputs"] }, EPOCH, 100)
    ).toBe(false);
    expect(lastRunCutByCash({ worldEpoch: "old", turn: 99, runCutBy: ["cash"] }, EPOCH, 100)).toBe(
      false
    );
    expect(
      lastRunCutByCash(
        {
          worldEpoch: EPOCH,
          turn: 100 - CASH_CUT_EVIDENCE_MAX_AGE_TURNS - 1,
          runCutBy: ["cash"],
        },
        EPOCH,
        100
      )
    ).toBe(false);
    expect(lastRunCutByCash(null, EPOCH, 100)).toBe(false);
    expect(lastRunCutByCash({ worldEpoch: EPOCH, turn: 99, runCutBy: ["cash"] }, null, 100)).toBe(
      false
    );
  });
});

describe("corpHeldByCashCut", () => {
  it("holds the corp when any sector was cut by cash", () => {
    const clean = { producerSettlement: { worldEpoch: EPOCH, turn: 99 } };
    const cut = { producerSettlement: { worldEpoch: EPOCH, turn: 99, runCutBy: ["cash"] } };
    expect(corpHeldByCashCut([clean, cut], EPOCH, 100)).toBe(true);
    expect(corpHeldByCashCut([clean, {}], EPOCH, 100)).toBe(false);
  });
});
