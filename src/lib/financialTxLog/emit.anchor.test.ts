import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildTxDocs, type TxInput } from "./emit";
import { DEFAULT_TX_THRESHOLDS } from "@/lib/db/types/financialTxLog";
it.each([undefined, 0, -1, Infinity, NaN])(
  "leaves anchor evidence unavailable for invalid FX %s",
  (rate) => {
    const entry: TxInput = {
      type: "corp_capital_injection",
      turn: 1,
      createdAt: new Date(0),
      subjectType: "corporation",
      subjectId: new ObjectId(),
      subjectName: "Fixture",
      amount: 150,
      currencyCode: "JPY",
    };
    const rates = rate === undefined ? new Map<string, number>() : new Map([["JPY", rate]]);
    expect(buildTxDocs([entry], DEFAULT_TX_THRESHOLDS, 60, rates)[0].anchorAmount).toBeUndefined();
    expect(
      buildTxDocs([entry], DEFAULT_TX_THRESHOLDS, 60, new Map([["JPY", 150]]))[0].anchorAmount
    ).toBe(1);
  }
);
