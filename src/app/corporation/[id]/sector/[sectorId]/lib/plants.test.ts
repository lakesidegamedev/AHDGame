import { describe, it, expect } from "vitest";
import {
  IDLE_CAUSE_FILL,
  buildOrderMoney,
  fmtTeuEstimate,
  idleCauseMeta,
  TONE_FILL,
  withAnchorAmount,
} from "./plants";

describe("bank charter", () => {
  it("never shows financial capacity as reserved for a bank network", () => {
    expect(Object.keys(idleCauseMeta("financial"))).not.toContain("bank");
  });
});

describe("staffing idle explanation", () => {
  it("names a worker shortage on the run meter", () => {
    const staffing = idleCauseMeta("media").staffing;
    expect(staffing.label).toBe("Stopped: short of workers");
    expect(staffing.tone).toBe("warning");
    expect(staffing.help.toLowerCase()).toContain("workers");
  });
});

describe("idle cause meter colors", () => {
  it("distinguishes input shortages from worker shortages without changing their warning severity", () => {
    const causes = idleCauseMeta("media");

    expect(causes.inputs.tone).toBe("warning");
    expect(causes.staffing.tone).toBe("warning");
    expect(IDLE_CAUSE_FILL.inputs).not.toBe(IDLE_CAUSE_FILL.staffing);
  });

  it("gives a sector waiting on inputs its own swatch, separate from demand limited", () => {
    const causes = idleCauseMeta("manufacturing");

    expect(causes.inputs.tone).toBe("warning");
    expect(causes.demand.tone).toBe("warning");
    // Both stay warning severity, but the capacity chart must not paint them
    // the same: buying inputs and waiting for buyers are different remedies.
    expect(IDLE_CAUSE_FILL.inputs).not.toBe(IDLE_CAUSE_FILL.demand);
    expect(IDLE_CAUSE_FILL.inputs).not.toBe(TONE_FILL.warning);
  });

  it("gives every idle cause a unique swatch so no two legend dots collide", () => {
    const entries = Object.entries(IDLE_CAUSE_FILL);

    expect(entries).toHaveLength(13);
    const fills = new Set(entries.map(([, fill]) => fill));
    expect(fills.size).toBe(entries.length);
    for (const fill of fills) expect(fill).toMatch(/^bg-/);
  });

  it("says local-market outputs cannot sell into a shortage elsewhere (ticket 1700)", () => {
    expect(idleCauseMeta("manufacturing").demand.help).not.toMatch(/only in this state/);
    expect(idleCauseMeta("construction", ["Construction Services"]).demand.help).toMatch(
      /Construction Services sells only in this state, so a shortage elsewhere does not raise demand here\.$/
    );
    expect(idleCauseMeta("construction", ["Freight", "Construction Services"]).demand.help).toMatch(
      /Freight and Construction Services sell only in this state/
    );
  });
});

describe("fmtTeuEstimate", () => {
  it("never rounds a real need down to zero", () => {
    expect(fmtTeuEstimate(0.4)).toBe("0.4");
    expect(fmtTeuEstimate(0.04)).toBe("less than 0.1");
    expect(fmtTeuEstimate(2.26)).toBe("2.3");
    expect(fmtTeuEstimate(80.4)).toBe("80");
    expect(fmtTeuEstimate(0)).toBe("0");
  });
});

describe("buildOrderMoney", () => {
  it("reads the stored paid amount once and refunds 75% of the unfinished share", () => {
    const m = buildOrderMoney({ costPaidAnchor: 20_000, progress: 0.25 });
    expect(m.paid).toBe(20_000);
    expect(m.stillToArrive).toBe(15_000);
    expect(m.refund).toBe(11_250);
  });
  it("clamps bad input", () => {
    expect(buildOrderMoney({ costPaidAnchor: -5, progress: 2 })).toEqual({
      paid: 0,
      stillToArrive: 0,
      refund: 0,
    });
  });
});

describe("withAnchorAmount", () => {
  it("pins the fixed anchor figure beside a re-priced amount", () => {
    expect(withAnchorAmount("$19.3K", 18_500)).toBe("$19.3K at today's rates, ₳18.5K when paid");
  });
  it("adds nothing when the amount is already in the anchor currency", () => {
    expect(withAnchorAmount("₳18.5K", 18_500)).toBe("₳18.5K");
  });
});
