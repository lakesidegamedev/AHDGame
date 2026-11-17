import type { Db, ObjectId } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { combineLiabilityBooks } from "./rules/financialHoldings";

/** Corporate arrears keep their original denomination and creditor jurisdiction. */
export async function transferCorporateArrears(
  db: Db,
  fromId: ObjectId,
  toId: ObjectId
): Promise<void> {
  if (fromId.equals(toId)) return;
  const corps = corporationsCollection(db);
  const projection = {
    operatingCashArrearsByCurrency: 1,
    federalTaxArrearsAnchorByCountry: 1,
  } as const;
  const preview = await corps.findOne({ _id: fromId }, { projection });
  if (!preview?.operatingCashArrearsByCurrency && !preview?.federalTaxArrearsAnchorByCountry)
    return;
  await runRequiredTransaction(
    async (session) => {
      const source = await corps.findOne({ _id: fromId }, { session, projection });
      const target = await corps.findOne({ _id: toId }, { session, projection });
      if (!source || !target) throw new Error("Missing corporate arrears successor");
      const operatingCashArrearsByCurrency = combineLiabilityBooks(
        source.operatingCashArrearsByCurrency,
        target.operatingCashArrearsByCurrency
      );
      const federalTaxArrearsAnchorByCountry = combineLiabilityBooks(
        source.federalTaxArrearsAnchorByCountry,
        target.federalTaxArrearsAnchorByCountry
      );
      const credited = await corps.updateOne(
        { _id: toId },
        { $set: { operatingCashArrearsByCurrency, federalTaxArrearsAnchorByCountry } },
        { session }
      );
      const cleared = await corps.updateOne(
        { _id: fromId },
        { $unset: { operatingCashArrearsByCurrency: "", federalTaxArrearsAnchorByCountry: "" } },
        { session }
      );
      if (credited.matchedCount !== 1 || cleared.matchedCount !== 1)
        throw new Error("Missing corporate arrears account");
    },
    { client: db.client }
  );
}
