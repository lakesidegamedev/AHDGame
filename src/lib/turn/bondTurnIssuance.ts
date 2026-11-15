import type { Db } from "mongodb";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { sovereignIssuanceFlowsByCountry } from "@/lib/resetFinance/rules/sovereignProceeds";

export async function readCapturedSovereignIssuance(
  db: Db,
  turn: number,
  funded: boolean,
  legacy: Parameters<typeof sovereignIssuanceFlowsByCountry>[0]
) {
  if (!funded) return sovereignIssuanceFlowsByCountry(legacy);
  // Refunding issues can be created during maturity settlement, after the
  // turn-open issue snapshot. Durable cash receipts include those sales and
  // survive a same-turn retry; an in-kind rollover has no invented proceeds.
  const receipts = await financialTxLogCollection<{
    countryId: string;
    amount: number;
    meta?: { face?: number };
  }>(db)
    .find(
      { turn, type: "gov_bond_issuance", "meta.ledgerOwnedBySettlement": true },
      { projection: { countryId: 1, amount: 1, "meta.face": 1 } }
    )
    .toArray();
  return sovereignIssuanceFlowsByCountry({
    atParIssues: [],
    placements: receipts.map((row) => {
      if (row.meta?.face === undefined)
        throw new Error("Funded sovereign issuance receipt is missing debt face");
      return { countryId: row.countryId, face: row.meta.face, cashPaid: row.amount };
    }),
  });
}
