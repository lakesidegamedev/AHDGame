import { beforeEach, describe, expect, it, vi } from "vitest";

const aggregate = vi.fn();
const findOne = vi.fn();
vi.mock("@/lib/db/repositories/actionAuditLog", () => ({
  actionAuditLogCollection: () => ({ aggregate }),
}));
vi.mock("@/lib/db/repositories/financialTxLog", () => ({
  financialTxLogCollection: () => ({ aggregate }),
}));
vi.mock("@/lib/db/repositories/treasuryTransactions", () => ({
  treasuryTransactionsCollection: () => ({ aggregate }),
}));
vi.mock("@/lib/db/repositories/savingsLedger", () => ({
  savingsLedgerCollection: () => ({ aggregate }),
}));
vi.mock("@/lib/db/repositories/gameConfig", () => ({
  gameConfigCollection: () => ({ findOne }),
}));
vi.mock("@/lib/db/repositories/gameState", () => ({ gameStateCollection: () => ({ findOne }) }));

import { previewHeldTurn } from "./holdPreview";

const rows = (row: Record<string, number> | null) => ({
  toArray: async () => (row ? [row] : []),
});

describe("previewHeldTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when nothing is held", async () => {
    expect(await previewHeldTurn({} as never, { processingHeldPhases: [] })).toBeNull();
  });

  it("reports unknown for a step the audit trail cannot see when the audit log is off", async () => {
    findOne.mockResolvedValue({ auditLog: false });
    const preview = await previewHeldTurn({} as never, {
      processingTargetTurn: 3,
      processingHeldPhases: ["pensionTurn"],
    });
    expect(preview?.steps[0]).toMatchObject({
      phase: "pensionTurn",
      verdict: "unknown",
      onAllowList: false,
    });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("counts audited rows by the step trace id and rows by turn for steps with probes", async () => {
    findOne.mockResolvedValue({ auditLog: true });
    aggregate
      .mockReturnValueOnce(rows({ count: 4, sum_amount: 10.123, sum_anchorAmount: 20 }))
      .mockReturnValueOnce(rows(null));
    const preview = await previewHeldTurn({} as never, {
      processingTargetTurn: 3,
      processingHeldPhases: ["bondTurn"],
    });
    const first = aggregate.mock.calls[0][0][0].$match;
    expect(first).toEqual({ traceId: "turn:3:bondTurn" });
    expect(preview?.steps[0].verdict).toBe("some");
    expect(preview?.steps[0].probes[0]).toMatchObject({
      count: 4,
      sums: { amount: 10.12, anchorAmount: 20 },
    });
    expect(preview?.previewToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives the same token for the same counts and a different one when a count changes", async () => {
    findOne.mockResolvedValue({ auditLog: true });
    const run = async (n: number) => {
      aggregate.mockReset();
      aggregate
        .mockReturnValueOnce(rows({ count: n, sum_amount: 1, sum_anchorAmount: 1 }))
        .mockReturnValueOnce(rows(null));
      return (
        await previewHeldTurn({} as never, {
          processingTargetTurn: 3,
          processingHeldPhases: ["bondTurn"],
        })
      )?.previewToken;
    };
    const a = await run(4);
    expect(await run(4)).toBe(a);
    expect(await run(5)).not.toBe(a);
  });
});
