import { describe, it, expect } from "vitest";
import { IDLE_CAUSE_FILL, idleCauseMeta, TONE_FILL } from "./plants";

describe("bank capacity explanation", () => {
  it("explains the configured branch share and its deposit ceiling benefit", () => {
    const bank = idleCauseMeta("financial", 0.6).bank;
    expect(bank?.label).toBe("Reserved for your bank network");
    expect(bank.tone).toBe("info");
    expect(bank.help).toContain("60%");
    expect(bank.help).toContain("branch capacity share");
    expect(bank.help).toContain("deposit ceiling");
  });
});

describe("staffing idle explanation", () => {
  it("names a worker shortage on the run meter", () => {
    const staffing = idleCauseMeta("media").staffing;
    expect(staffing.label).toBe("Short of workers");
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

    expect(entries).toHaveLength(12);
    const fills = new Set(entries.map(([, fill]) => fill));
    expect(fills.size).toBe(entries.length);
    for (const fill of fills) expect(fill).toMatch(/^bg-/);
  });

  it("says local-market outputs cannot sell into a shortage elsewhere (ticket 1700)", () => {
    expect(idleCauseMeta("manufacturing").demand.help).not.toMatch(/only in this state/);
    expect(idleCauseMeta("construction", undefined, ["Construction Services"]).demand.help).toMatch(
      /Construction Services sells only in this state, so a shortage elsewhere does not raise demand here\.$/
    );
    expect(
      idleCauseMeta("construction", undefined, ["Freight", "Construction Services"]).demand.help
    ).toMatch(/Freight and Construction Services sell only in this state/);
  });
});
