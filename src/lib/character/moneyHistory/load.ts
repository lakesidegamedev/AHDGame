import { ObjectId, type Db } from "mongodb";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import {
  toMoneyHistoryRow,
  walletFilter,
  type MoneyHistoryRow,
  type MoneyHistoryWallet,
} from "./rules";

export const MONEY_HISTORY_PAGE_SIZE = 50;
export const MONEY_HISTORY_MAX_PAGE_SIZE = 100;

export interface MoneyHistoryPage {
  rows: MoneyHistoryRow[];
  /** Opaque cursor for the next older page, or null at the end. */
  nextCursor: string | null;
}

const PROJECTION = {
  type: 1,
  turn: 1,
  createdAt: 1,
  amount: 1,
  currencyCode: 1,
  balanceAfter: 1,
  counterpartyType: 1,
  counterpartyName: 1,
  counterpartyDeletedAt: 1,
  "meta.wallet": 1,
} as const;

/**
 * Newest-first page of one character's own log rows. The subject id is the
 * only caller-independent scope; it must come from the signed-in session.
 */
export async function loadMoneyHistory(
  db: Db,
  characterId: ObjectId,
  opts: { cursor?: string | null; limit?: number; wallet?: MoneyHistoryWallet | null; now?: Date }
): Promise<MoneyHistoryPage> {
  const limit = Math.min(
    Math.max(1, Math.floor(opts.limit ?? MONEY_HISTORY_PAGE_SIZE)),
    MONEY_HISTORY_MAX_PAGE_SIZE
  );
  const filter: Record<string, unknown> = {
    subjectId: characterId,
    subjectType: "character",
    expiresAt: { $gt: opts.now ?? new Date() },
    amount: { $ne: 0 },
  };
  if (opts.wallet) Object.assign(filter, walletFilter(opts.wallet));
  if (opts.cursor && ObjectId.isValid(opts.cursor)) filter._id = { $lt: new ObjectId(opts.cursor) };

  const docs = await financialTxLogCollection<
    Pick<FinancialTxLogEntry, "_id" | "meta" | Exclude<keyof typeof PROJECTION, "meta.wallet">>
  >(db)
    .find(filter, { projection: PROJECTION })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();

  const page = docs.slice(0, limit);
  return {
    rows: page.map(toMoneyHistoryRow),
    nextCursor: docs.length > limit ? page[page.length - 1]._id.toString() : null,
  };
}
