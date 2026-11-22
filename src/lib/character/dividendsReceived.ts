import type { Db, ObjectId } from "mongodb";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";

export interface DividendsReceived {
  /** Turn the most recent dividends were credited. */
  turn: number;
  /** Total credited that turn across every company, in anchor units. */
  amountAnchor: number;
}

interface DividendRow {
  turn: number;
  amount: number;
  anchorAmount?: number;
}

/** Sum the credits of the newest payout turn. Pure so the profile and any other screen agree. */
export function sumLatestDividendTurn(rows: readonly DividendRow[]): DividendsReceived | null {
  let latest = -Infinity;
  for (const row of rows) if (row.turn > latest) latest = row.turn;
  if (!Number.isFinite(latest)) return null;
  const amountAnchor = rows
    .filter((row) => row.turn === latest)
    .reduce((sum, row) => sum + (row.anchorAmount ?? row.amount), 0);
  return { turn: latest, amountAnchor };
}

/** What the player was actually paid in dividends on their most recent payout turn. */
export async function loadDividendsReceived(
  db: Db,
  characterId: ObjectId
): Promise<DividendsReceived | null> {
  const newest = await financialTxLogCollection<DividendRow>(db).findOne(
    { subjectId: characterId, subjectType: "character", type: "corp_dividend" },
    { sort: { _id: -1 }, projection: { turn: 1 } }
  );
  if (!newest) return null;
  const rows = await financialTxLogCollection<DividendRow>(db)
    .find(
      {
        subjectId: characterId,
        subjectType: "character",
        type: "corp_dividend",
        turn: newest.turn,
      },
      { projection: { turn: 1, amount: 1, anchorAmount: 1 }, limit: 200 }
    )
    .toArray();
  return sumLatestDividendTurn(rows);
}
