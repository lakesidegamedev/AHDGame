import { describe, expect, it } from "vitest";
import { fiscalMirrorFields, regionalFiscalRatios, type FiscalRatios } from "./fiscalMirror";

const RATIOS: FiscalRatios = {
  debtToGdp: 64.27,
  budgetBalance: -3.14,
  schuldenbremseHeadroom: 0.123,
};

describe("fiscalMirrorFields", () => {
  it("emits rounded value fields only for metrics the region stores", () => {
    const stored = new Set(["governance.debtToGdp", "governance.budgetBalance"]);
    const out = fiscalMirrorFields(RATIOS, (id) => stored.has(id));
    expect(out).toEqual({
      "governance.debtToGdp.value": 64.3, // 1dp
      "governance.budgetBalance.value": -3.1, // 1dp
    });
    // schuldenbremse NOT stored here (1991 / non-DE) → absent
    expect(out["governance.schuldenbremseHeadroom.value"]).toBeUndefined();
  });

  it("rounds schuldenbremse to 2dp when stored", () => {
    const out = fiscalMirrorFields(RATIOS, () => true);
    expect(out["governance.schuldenbremseHeadroom.value"]).toBe(0.12);
  });

  it("returns an empty object when ratios are missing", () => {
    expect(fiscalMirrorFields(undefined, () => true)).toEqual({});
  });
});

describe("regionalFiscalRatios", () => {
  it("uses the region's own surplus and debt, not national figures", () => {
    const out = regionalFiscalRatios({
      surplus: 5,
      stateGdp: 100,
      financing: { principal: 0 },
    });
    expect(out).toEqual({ budgetBalance: 5, debtToGdp: 0 });
  });

  it("reads a regional deficit and borrowing as percent of output", () => {
    expect(
      regionalFiscalRatios({ surplus: -2, stateGdp: 50, financing: { principal: 10 } })
    ).toEqual({ budgetBalance: -4, debtToGdp: 20 });
  });

  it("returns nothing without regional output, and never the national headroom", () => {
    expect(regionalFiscalRatios({ surplus: 1, stateGdp: 0 })).toBeUndefined();
    const out = fiscalMirrorFields(regionalFiscalRatios({ surplus: 1, stateGdp: 10 }), () => true);
    expect(out).toEqual({ "governance.budgetBalance.value": 10, "governance.debtToGdp.value": 0 });
  });
});
