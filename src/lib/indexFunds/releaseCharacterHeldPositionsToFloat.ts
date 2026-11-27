import { withSessionDb } from "@/lib/db/sessionDb";
import type { Db, ObjectId } from "mongodb";

import { creditFundPosition, debitFundPosition } from "./fundQueries";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";

export interface ReleaseCharacterHeldPositionsResult {
  unitsReleased: number;
  positionsReleased: number;
}

/** Transfer abandoned claims to reserve without burning supply or moving fund cash. */
export async function releaseCharacterHeldIndexFundPositionsToFloat(
  db: Db,
  characterIds: ObjectId[]
): Promise<ReleaseCharacterHeldPositionsResult> {
  if (characterIds.length === 0) {
    return { unitsReleased: 0, positionsReleased: 0 };
  }

  return withSessionDb(db, async (db) => {
    const positions = await indexFundPositionsCollection(db)
      .find(
        { holderKind: "character", characterId: { $in: characterIds } },
        { projection: { _id: 1, fundId: 1, characterId: 1, units: 1 } }
      )
      .toArray();

    let unitsReleased = 0;
    let positionsReleased = 0;

    for (const pos of positions) {
      const characterId = pos.characterId;
      const units = pos.units ?? 0;
      if (!characterId || units <= 0) continue;

      const fund = await indexFundsCollection(db).findOne(
        { _id: pos.fundId },
        { projection: { quotedNav: 1 } }
      );

      if (!fund || !Number.isFinite(fund.quotedNav) || fund.quotedNav < 0)
        throw new Error("Cannot release a position without its fund valuation");
      const debited = await debitFundPosition(db, pos.fundId, "character", { characterId }, units);
      if (!debited.ok) continue;
      await creditFundPosition(db, pos.fundId, "fund_reserve", {}, units, fund.quotedNav);

      unitsReleased += units;
      positionsReleased += 1;
    }

    return { unitsReleased, positionsReleased };
  });
}
