import type { Db } from "mongodb";

import type { BankLoan } from "@/lib/db/types/bank";
import type { Character, Corporation } from "@/lib/db/types";

/**
 * Borrower display names for the loan-servicing ledger rows.
 *
 * `serviceNamedLoanBook` used to read one name per serviced loan. A bank's whole
 * loan book is known before it starts, so v2 loads every name once per bank and
 * looks it up. Names cannot change inside a turn, so the map returns exactly the
 * value the per-loan read would have returned.
 */
export async function loadLoanBorrowerNames(
  db: Db,
  loans: readonly BankLoan[]
): Promise<Map<string, string>> {
  const characterIds = loans.flatMap((loan) =>
    loan.borrowerType === "character" && loan.borrowerId ? [loan.borrowerId] : []
  );
  const corporationIds = loans.flatMap((loan) =>
    loan.borrowerType === "corporation" && loan.borrowerId ? [loan.borrowerId] : []
  );
  const [characters, corporations] = await Promise.all([
    characterIds.length > 0
      ? db
          .collection<Character>("characters")
          .find({ _id: { $in: characterIds } }, { projection: { name: 1 } })
          .toArray()
      : Promise.resolve([]),
    corporationIds.length > 0
      ? db
          .collection<Corporation>("corporations")
          .find({ _id: { $in: corporationIds } }, { projection: { name: 1 } })
          .toArray()
      : Promise.resolve([]),
  ]);
  const nameByBorrowerKey = new Map<string, string>();
  for (const character of characters) {
    nameByBorrowerKey.set(`character:${String(character._id)}`, character.name ?? "Borrower");
  }
  for (const corporation of corporations) {
    nameByBorrowerKey.set(`corporation:${String(corporation._id)}`, corporation.name ?? "Borrower");
  }
  return nameByBorrowerKey;
}

/** Borrower display name for the ledger leg. One read per serviced loan. */
export async function readBorrowerName(db: Db, loan: BankLoan): Promise<string> {
  if (!loan.borrowerId) return "Borrower";
  if (loan.borrowerType === "character") {
    const character = await db
      .collection<Character>("characters")
      .findOne({ _id: loan.borrowerId }, { projection: { name: 1 } });
    return character?.name ?? "Borrower";
  }
  const corporation = await db
    .collection<Corporation>("corporations")
    .findOne({ _id: loan.borrowerId }, { projection: { name: 1 } });
  return corporation?.name ?? "Borrower";
}
