import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { loadConstructionLoanDebtAnchorByCorpId, valuationCashAnchor } from "./honestBalanceSheets";

describe("valuationCashAnchor", () => {
  it("floors overdrawn cash at zero while the stage is off", () => {
    expect(valuationCashAnchor(-500, 0)).toBe(0);
    expect(valuationCashAnchor(500, 0)).toBe(500);
  });

  it("keeps overdrawn cash negative once the stage is on", () => {
    expect(valuationCashAnchor(-500, 1)).toBe(-500);
  });
});

describe("loadConstructionLoanDebtAnchorByCorpId", () => {
  it("sums live construction loan principal per borrower in anchor units", async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const find = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { borrowerId: a, outstanding: 100, currency: "USD" },
        { borrowerId: a, outstanding: 50, currency: "USD" },
        { borrowerId: b, outstanding: 0, currency: "USD" },
        { outstanding: 80, currency: "USD" },
      ]),
    });
    const db = { collection: vi.fn().mockReturnValue({ find }) } as unknown as Db;
    const out = await loadConstructionLoanDebtAnchorByCorpId(db, new Map([["USD", 1]]));
    expect(out.get(a.toString())).toBeCloseTo(150, 6);
    expect(out.has(b.toString())).toBe(false);
    const filter = find.mock.calls[0][0];
    expect(filter.borrowerType).toBe("corporation");
    expect(filter.status.$in).toEqual(["current", "arrears", "defaulted"]);
  });
});
