import type { Db } from "mongodb";
import type { Corporation, BankCharter } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";

/**
 * Lock keys for each deposit taker's pass, as `<collection>:<id>`: the bank,
 * its currency's central bank and insurance fund, every player depositor and
 * every borrower of a loan this pass services.
 */
export async function bankPassLockKeys(
  db: Db,
  turn: number,
  depositTakers: readonly {
    corp: Pick<Corporation, "_id">;
    charter: Pick<BankCharter, "currency">;
  }[]
): Promise<Map<string, string[]>> {
  const keys = new Map<string, string[]>();
  const bankIdsByCurrency = new Map<string, string[]>();
  for (const { corp, charter } of depositTakers) {
    const currency = charter.currency as CurrencyCode;
    keys.set(corp._id.toString(), [
      `corporations:${corp._id.toString()}`,
      `centralBanks:${getBankId(getCountryIdForCurrency(currency))}`,
      `depositInsuranceFunds:${currency}`,
    ]);
    bankIdsByCurrency.set(currency, [
      ...(bankIdsByCurrency.get(currency) ?? []),
      corp._id.toString(),
    ]);
  }
  if (!depositTakers.length) return keys;
  const [depositors, loans] = await Promise.all([
    charactersCollection(db)
      .find(
        {
          $or: [...bankIdsByCurrency].map(([currency, ids]) => ({
            [`currencyBalances.savingsHolder.${currency}`]: { $in: ids },
          })),
        },
        { projection: { _id: 1, "currencyBalances.savingsHolder": 1 } }
      )
      .toArray(),
    bankLoansCollection(db)
      .find(
        {
          bankCorporationId: { $in: depositTakers.map((row) => row.corp._id) },
          borrowerType: { $in: ["character", "corporation"] },
          status: { $in: ["current", "arrears"] },
          lastProcessedTurn: { $ne: turn },
        },
        { projection: { bankCorporationId: 1, borrowerType: 1, borrowerId: 1 } }
      )
      .toArray(),
  ]);
  for (const depositor of depositors) {
    const holders = (depositor.currencyBalances?.savingsHolder ?? {}) as Record<string, unknown>;
    for (const bankId of Object.values(holders))
      keys.get(String(bankId))?.push(`characters:${depositor._id.toString()}`);
  }
  for (const loan of loans) {
    if (!loan.borrowerId) continue;
    const collection = loan.borrowerType === "character" ? "characters" : "corporations";
    keys.get(String(loan.bankCorporationId))?.push(`${collection}:${String(loan.borrowerId)}`);
  }
  return keys;
}
