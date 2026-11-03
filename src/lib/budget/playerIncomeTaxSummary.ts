/** Personal tax statements expose frozen assessments and unpaid liabilities to their owner. */
import type { Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import { incomeTaxDebtAnchor, type IncomeTier } from "./rules/incomeTaxTiers";
import type { PlayerIncomeTaxAssessment } from "@/lib/db/types/incomeTax";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { outstandingTax } from "./rules/taxCollection";
import { validatePendingStockTaxReceipt } from "./rules/capitalGainsTax";
export interface PlayerTaxStatement {
  initialTier: IncomeTier;
  currentTier: IncomeTier;
  unpaidTaxAnchor: number;
  assessments: Array<{
    taxKind?: "income" | "capitalGains";
    turn: number;
    currency: string;
    gross: number;
    tax: number;
    net: number;
    pending: boolean;
    paidTax: number;
    remainingTax: number;
    collectedTurn?: number;
    withheldAtSource?: boolean;
  }>;
}
export async function loadPlayerIncomeTaxSummary(
  db: Db,
  character: Pick<
    Character,
    "_id" | "initialIncomeTier" | "incomeTier" | "demographics" | "pendingStockTaxReceipts"
  >,
  turn: number,
  ownerCollection: "characters" | "imperialCharacters" = "characters",
  rates?: Partial<Record<CurrencyCode, number>>
): Promise<PlayerTaxStatement> {
  const records = await db
    .collection<PlayerIncomeTaxAssessment>("playerIncomeTaxAssessments")
    .find(
      {
        status: { $in: ["unpaid", "collected", "paid"] },
        characterId: character._id,
        ownerCollection,
        $or: [
          { turn: { $gte: turn - 12 } },
          { collectedTurn: { $gte: turn - 12 } },
          { status: "unpaid" },
        ],
      },
      {
        projection: {
          turn: 1,
          currency: 1,
          status: 1,
          gross: 1,
          federal: 1,
          regional: 1,
          net: 1,
          sourceFx: 1,
          taxKind: 1,
          collectedFederal: 1,
          collectedRegional: 1,
          collectedTurn: 1,
          withheldAtSource: 1,
        },
      }
    )
    .toArray();
  const reservedRows: PlayerTaxStatement["assessments"] = [];
  const actorMarker = ":" + ownerCollection + ":" + character._id.toHexString() + ":";
  const assessedSaleKeys = new Set(
    records.flatMap((record) => {
      const offset = record.withheldAtSource ? record._id.indexOf(actorMarker) : -1;
      return offset < 0 ? [] : [record._id.slice(offset + actorMarker.length)];
    })
  );
  for (const receipt of character.pendingStockTaxReceipts ?? []) {
    if (!receipt.withholding || receipt.saleTurn < turn - 12) continue;
    validatePendingStockTaxReceipt(receipt);
    for (const taxKind of ["income", "capitalGains"] as const) {
      if (assessedSaleKeys.has(receipt.id + ":" + taxKind)) continue;
      const tax = taxKind === "income" ? receipt.withholding.income : receipt.withholding.capital;
      if (!(tax.gross > 0)) continue;
      reservedRows.push({
        taxKind,
        turn: receipt.saleTurn,
        currency: receipt.withholding.context.currency,
        gross: tax.gross,
        tax: tax.federal + tax.regional,
        net: tax.net,
        pending: false,
        paidTax: tax.federal + tax.regional,
        remainingTax: 0,
        withheldAtSource: true,
        collectedTurn: receipt.saleTurn,
      });
    }
  }
  return {
    initialTier: character.initialIncomeTier ?? character.demographics?.wealth ?? "middle",
    currentTier:
      character.incomeTier ??
      character.initialIncomeTier ??
      character.demographics?.wealth ??
      "middle",
    unpaidTaxAnchor: records.reduce(
      (sum, record) =>
        sum +
        (record.status === "unpaid" && !record.withheldAtSource
          ? incomeTaxDebtAnchor(
              outstandingTax(record).federal + outstandingTax(record).regional,
              record.sourceFx,
              rates?.[record.currency as CurrencyCode]
            )
          : 0),
      0
    ),
    assessments: [
      ...reservedRows,
      ...records.map((record) => ({
        ...(record.taxKind ? { taxKind: record.taxKind } : {}),
        turn: record.turn,
        currency: record.currency,
        gross: record.gross,
        tax: record.federal + record.regional,
        net: record.net,
        pending: record.status === "unpaid" && !record.withheldAtSource,
        withheldAtSource: record.withheldAtSource,
        paidTax:
          record.withheldAtSource || record.status === "paid" || record.status === "collected"
            ? record.federal + record.regional
            : (record.collectedFederal ?? 0) + (record.collectedRegional ?? 0),
        remainingTax:
          record.status === "unpaid" && !record.withheldAtSource
            ? outstandingTax(record).federal + outstandingTax(record).regional
            : 0,
        ...(record.collectedTurn !== undefined ? { collectedTurn: record.collectedTurn } : {}),
      })),
    ].sort((a, b) => b.turn - a.turn),
  };
}

/** One projected read supplies outstanding liabilities to portfolio and wealth snapshots. */
export async function loadUnpaidIncomeTaxByCharacter(
  db: Db,
  rates?: Partial<Record<CurrencyCode, number>>
): Promise<Map<string, number>> {
  const rows = await db
    .collection<PlayerIncomeTaxAssessment>("playerIncomeTaxAssessments")
    .find(
      { status: "unpaid", withheldAtSource: { $ne: true } },
      {
        projection: {
          characterId: 1,
          currency: 1,
          federal: 1,
          regional: 1,
          sourceFx: 1,
          collectedFederal: 1,
          collectedRegional: 1,
        },
      }
    )
    .toArray();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.characterId.toHexString();
    const debt = incomeTaxDebtAnchor(
      outstandingTax(row).federal + outstandingTax(row).regional,
      row.sourceFx,
      rates?.[row.currency as CurrencyCode]
    );
    totals.set(key, (totals.get(key) ?? 0) + debt);
  }
  return totals;
}
