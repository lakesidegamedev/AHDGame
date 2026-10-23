import type { Db, ObjectId } from "mongodb";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types/indexFund";
import { creditFundPosition, debitFundPosition } from "./fundQueries";

export interface ReleaseCorporationHeldPositionsResult {
  unitsReleased: number;
  positionsReleased: number;
}

/**
 * Remove a dissolved corporation's index-fund positions before the
 * corporation doc is deleted, the corporation analogue of
 * `releaseCharacterHeldIndexFundPositionsToFloat`.
 *
 * Same no-cash abandonment semantics: `IndexFund.unitSupply` is the fund's
 * total outstanding claims and must stay constant, so the units move to the
 * fund's own `fund_reserve` position rather than being burned. Without this,
 * a dissolving corporation leaves an `indexFundPositions` row keyed to a
 * corporation that no longer exists, and wind-up then cannot pay that holder
 * (no corporation to credit) — which used to throw and abort every other
 * holder's payout for the turn.
 */
export async function releaseCorporationHeldIndexFundPositionsToFloat(
  db: Db,
  corporationIds: ObjectId[]
): Promise<ReleaseCorporationHeldPositionsResult> {
  if (corporationIds.length === 0) {
    return { unitsReleased: 0, positionsReleased: 0 };
  }

  const positions = await db
    .collection<IndexFundPosition>("indexFundPositions")
    .find(
      { holderKind: "corporation", corporationId: { $in: corporationIds } },
      { projection: { _id: 1, fundId: 1, corporationId: 1, units: 1 } }
    )
    .toArray();

  // One batched NAV read for every fund touched by the release: turn code may
  // not repeat a read per position (scripts/architecture/turnMongoLoops).
  const fundIds = Array.from(
    new Map(positions.map((pos) => [pos.fundId.toString(), pos.fundId])).values()
  );
  const funds = await db
    .collection<IndexFund>("indexFunds")
    .find({ _id: { $in: fundIds } }, { projection: { quotedNav: 1 } })
    .toArray();
  const navByFund = new Map(funds.map((fund) => [fund._id.toString(), fund.quotedNav ?? 0]));

  let unitsReleased = 0;
  let positionsReleased = 0;

  for (const pos of positions) {
    const corporationId = pos.corporationId;
    const units = pos.units ?? 0;
    if (!corporationId || units <= 0) continue;

    // CAS via debitFundPosition's own `units: { $gte: units }` guard: a
    // concurrent subscribe/redeem that changed the position between our read
    // and now makes the debit a no-op instead of releasing a stale count.
    const debited = await debitFundPosition(
      db,
      pos.fundId,
      "corporation",
      { corporationId },
      units
    );
    if (!debited.ok) continue;

    const quotedNav = navByFund.get(pos.fundId.toString()) ?? 0;
    await creditFundPosition(db, pos.fundId, "fund_reserve", {}, units, quotedNav);

    unitsReleased += units;
    positionsReleased += 1;
  }

  return { unitsReleased, positionsReleased };
}
