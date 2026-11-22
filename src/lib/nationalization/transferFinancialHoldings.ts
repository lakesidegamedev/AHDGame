import type { AnyBulkWriteOperation, ClientSession, Db, ObjectId } from "mongodb";
import type { Bond, Corporation } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { runWithDbSession } from "@/lib/db/sessionDb";
import {
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { consolidatePositions } from "./rules/financialHoldings";

/** Financial assets change owner as assets; their value is never credited again as cash. */
export async function transferFinancialHoldings(
  db: Db,
  fromId: ObjectId,
  toId: ObjectId,
  now: Date,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  if (fromId.equals(toId)) return;
  const corps = corporationsCollection(db),
    bonds = bondsCollection(db);
  const [previewShares, previewBonds] = await Promise.all([
    corps
      .find({ "shareholders.corporationId": fromId }, { projection: { shareholders: 1 } })
      .toArray(),
    bonds
      .find({ "holders.corporationId": fromId, matured: false }, { projection: { holders: 1 } })
      .toArray(),
  ]);
  if (
    !previewShares.some((c) => c.shareholders?.some((h) => h.corporationId?.equals(fromId))) &&
    !previewBonds.some((b) => b.holders?.some((h) => h.corporationId?.equals(fromId)))
  )
    return;
  const rates = await loadFxRatesByCurrency(db);
  const execute = async (session?: ClientSession) => {
    if (!(await corps.findOne({ _id: toId }, { session, projection: { _id: 1 } })))
      throw new Error("Missing financial holdings successor");
    const shares = await corps
      .find(
        { "shareholders.corporationId": fromId },
        { session, projection: { shareholders: 1, countryId: 1, liquidCurrencyCode: 1 } }
      )
      .toArray();
    const heldBonds = await bonds
      .find(
        { "holders.corporationId": fromId, matured: false },
        { session, projection: { holders: 1 } }
      )
      .toArray();
    const shareOps: AnyBulkWriteOperation<Corporation>[] = [],
      bondOps: AnyBulkWriteOperation<Bond>[] = [];
    for (const issuer of shares) {
      const owned = issuer.shareholders.filter(
        (h) => h.corporationId?.equals(fromId) || h.corporationId?.equals(toId)
      );
      if (owned.length === 1) {
        shareOps.push({
          updateOne: {
            filter: { _id: issuer._id },
            update: {
              $set: {
                shareholders: issuer.shareholders.map((h) =>
                  h.corporationId?.equals(fromId) ? { ...h, corporationId: toId } : h
                ),
                updatedAt: now,
              },
            },
          },
        });
        continue;
      }
      if (owned.some((h) => h.holdingTerms))
        throw new Error("Personal holding lots cannot be combined into a corporate successor");
      const currency = resolveCorpLiquidCurrencyCode(issuer);
      const needsFx = owned.some(
        (h) => h.avgCostPerShare !== undefined && h.avgCostBasisUnit !== "anchor"
      );
      const rate = needsFx && currency ? rates.get(currency) : 1;
      if (rate === undefined) throw new Error("Missing live holdings exchange rate");
      const merged = consolidatePositions(
        owned.map((h) => ({
          units: h.shares,
          unitCost: h.avgCostPerShare,
          anchorBasis: h.avgCostBasisUnit === "anchor",
          superUnits: h.superShares,
        })),
        rate
      );
      const rest = issuer.shareholders.filter(
        (h) => !h.corporationId?.equals(fromId) && !h.corporationId?.equals(toId)
      );
      const {
        avgCostPerShare: _cost,
        avgCostBasisUnit: _unit,
        superShares: _rights,
        ...position
      } = owned.find((h) => h.corporationId?.equals(toId)) ?? owned[0];
      const shareholders = [
        ...rest,
        {
          ...position,
          corporationId: toId,
          shares: merged.units,
          ...(merged.unitCost === undefined
            ? {}
            : { avgCostPerShare: merged.unitCost, avgCostBasisUnit: "anchor" as const }),
          ...(merged.superUnits > 0 ? { superShares: merged.superUnits } : {}),
        },
      ];
      shareOps.push({
        updateOne: {
          filter: { _id: issuer._id },
          update: { $set: { shareholders, updatedAt: now } },
        },
      });
    }
    for (const bond of heldBonds) {
      const owned = bond.holders.filter(
        (h) => h.corporationId?.equals(fromId) || h.corporationId?.equals(toId)
      );
      if (owned.some((h) => h.saleIntentId || h.bankTreasuryTradeId))
        throw new Error("An in-flight bond trade must settle before ownership changes");
      if (owned.length === 1) {
        bondOps.push({
          updateOne: {
            filter: { _id: bond._id },
            update: {
              $set: {
                holders: bond.holders.map((h) =>
                  h.corporationId?.equals(fromId) ? { ...h, corporationId: toId } : h
                ),
                updatedAt: now,
              },
            },
          },
        });
        continue;
      }
      const merged = consolidatePositions(
        owned.map((h) => ({ units: h.units, unitCost: h.avgCostPerUnit, anchorBasis: true })),
        1
      );
      const rest = bond.holders.filter(
        (h) => !h.corporationId?.equals(fromId) && !h.corporationId?.equals(toId)
      );
      const { avgCostPerUnit: _cost, ...position } =
        owned.find((h) => h.corporationId?.equals(toId)) ?? owned[0];
      const holders = [
        ...rest,
        {
          ...position,
          corporationId: toId,
          units: merged.units,
          ...(merged.unitCost === undefined ? {} : { avgCostPerUnit: merged.unitCost }),
        },
      ];
      bondOps.push({
        updateOne: { filter: { _id: bond._id }, update: { $set: { holders, updatedAt: now } } },
      });
    }
    if (!options.dryRun && shareOps.length) await corps.bulkWrite(shareOps, { session });
    if (!options.dryRun && bondOps.length) await bonds.bulkWrite(bondOps, { session });
  };
  if (options.dryRun) await execute();
  else await runWithDbSession(db, execute, { client: db.client });
}
