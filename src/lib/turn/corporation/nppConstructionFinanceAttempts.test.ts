import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/banking/constructionFinance", () => ({
  requestConstructionFinance: vi.fn(async (input: { principal: number }) =>
    input.principal > 100
      ? { ok: false, error: `Bank reserves cannot fund ${input.principal} anchor` }
      : input.principal > 50
        ? { ok: true, pending: true, loanId: "l", claimId: "c" }
        : { ok: true, pending: false, loanId: "l", claimId: "c" }
  ),
}));

import {
  attemptNppConstructionFinance,
  financeFailureReason,
} from "./nppConstructionFinanceAttempts";

const candidate = (principal: number) =>
  ({
    sector: { _id: { toHexString: () => `s${principal}` } },
    corporation: {},
    bankId: "b",
    principal,
    termTurns: 48,
    costLocal: principal,
    order: {},
  }) as never;

describe("NPP construction finance attempts", () => {
  it("buckets failure messages without their amounts", () => {
    expect(financeFailureReason("Bank reserves cannot fund 1,234.5 anchor")).toBe(
      "Bank reserves cannot fund # anchor"
    );
    expect(financeFailureReason(undefined)).toBe("unknown");
  });

  it("counts funded, pending and failed, and tallies why the failures failed", async () => {
    const result = await attemptNppConstructionFinance({
      db: {} as never,
      turn: 734,
      requests: [candidate(10), candidate(60), candidate(200), candidate(300)],
      backlogCount: 5,
    });
    expect(result).toEqual({
      funded: 1,
      pending: 1,
      failed: 7,
      failureReasons: {
        "not attempted (no lender or over cap)": 5,
        "Bank reserves cannot fund # anchor": 2,
      },
    });
  });
});
