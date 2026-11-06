import { fundPositionValue } from "./rules/portfolioValue";
/**
 * Corporate fund holdings are assets valued at current fund NAV in anchor cash.
 * The balance sheet converts that total to the corporation's own currency.
 */
import type { Db, ObjectId } from "mongodb";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types";

export async function loadCorporationFundPortfolio(db: Db, corporationId: ObjectId) {
  return loadFundPortfolio(db, { holderKind: "corporation", corporationId });
}

export async function loadCharacterFundPortfolio(db: Db, characterId: ObjectId) {
  return loadFundPortfolio(db, { holderKind: "character", characterId });
}

async function loadFundPortfolio(
  db: Db,
  holder:
    | { holderKind: "corporation"; corporationId: ObjectId }
    | { holderKind: "character"; characterId: ObjectId }
) {
  const positions = await db
    .collection<IndexFundPosition>("indexFundPositions")
    .find({ ...holder, units: { $gt: 0 } })
    .toArray();
  const funds = positions.length
    ? await db
        .collection<IndexFund>("indexFunds")
        .find(
          { _id: { $in: positions.map((p) => p.fundId) } },
          { projection: { name: 1, slug: 1, quotedNav: 1, status: 1 } }
        )
        .toArray()
    : [];
  const byId = new Map(funds.map((f) => [f._id.toString(), f]));
  const holdings = positions.map((p) => {
    const fund = byId.get(p.fundId.toString());
    return {
      fundId: p.fundId.toString(),
      slug: fund?.slug,
      name: fund?.name ?? "Unknown fund",
      units: p.units,
      valueAnchor: fundPositionValue(p.units, fund?.quotedNav, fund?.status),
    };
  });
  return { holdings, valueAnchor: holdings.reduce((sum, h) => sum + h.valueAnchor, 0) };
}
