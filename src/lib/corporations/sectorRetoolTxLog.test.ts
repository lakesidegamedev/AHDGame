import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";

const emitTx = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: (...args: unknown[]) => emitTx(...args) }));

import { emitSectorRetoolTx } from "./sectorRetoolTxLog";

const base = {
  corporationId: new ObjectId(),
  corporationName: "Retoolco",
  corporationSequentialId: 7,
  amountLocal: 4_808_001.066108,
  currencyCode: "USD" as const,
  turn: 675,
  createdAt: new Date("2026-11-05T01:34:06.003Z"),
  action: "retool" as const,
  sectorId: new ObjectId(),
  sectorType: "manufacturing",
  fromStrategyId: "standard",
  toStrategyId: "electronics_manufacturing",
};

describe("emitSectorRetoolTx", () => {
  beforeEach(() => emitTx.mockClear());

  it("books the exact cash debit as a negative corp_sector_retool row", async () => {
    await emitSectorRetoolTx({} as Db, base);
    expect(emitTx).toHaveBeenCalledTimes(1);
    const row = emitTx.mock.calls[0][1];
    expect(row).toMatchObject({
      type: "corp_sector_retool",
      turn: 675,
      subjectType: "corporation",
      subjectSequentialId: 7,
      amount: -4_808_001.066108,
      currencyCode: "USD",
      meta: {
        action: "retool",
        sectorType: "manufacturing",
        fromStrategyId: "standard",
        toStrategyId: "electronics_manufacturing",
      },
    });
  });

  it("emits nothing for a free retool", async () => {
    await emitSectorRetoolTx({} as Db, { ...base, amountLocal: 0 });
    expect(emitTx).not.toHaveBeenCalled();
  });
});
