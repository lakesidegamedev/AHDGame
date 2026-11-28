import { withTurnValueSettlement } from "./withTurnValueSettlement";
import { getCurrentTurn } from "./currentTurn";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { getMilitaryUnitsCollection } from "@/lib/db/collections/militaryUnits";
import { getUnitArchetype } from "@/lib/constants/military";
import { getNationalArsenal, drawLots } from "@/lib/db/collections/nationalArsenal";
import {
  applyEquipmentLots,
  lotsRequired,
  lotsToFillUnit,
  refitOrder,
} from "@/lib/military/arsenal";

export interface RefitResult {
  unitsRefitted: number;
  lotsUsed: number;
}

/**
 * Per-turn: bring under-equipped units up to standard from the national arsenal.
 *
 * This is what makes a unit raised against an empty store start at lower
 * quality and build up over time. Combat reads `equipment` via
 * `computeEffectivePower` (`1 + eqAvg × 0.03`), which otherwise only moves at
 * seed and recruit.
 *
 * Refits nearest-to-complete first: with scarce stock, this yields some
 * combat-worthy formations rather than raising every unit a little and leaving
 * none effective (same reasoning as `reinforceUnit`).
 *
 * Runs for EVERY country with units, defence seat or not, following
 * `applyReinforcement`: exempting one army would be a standing asymmetry.
 *
 * Deliberately does NOT raise `techTier`: topping up a legacy formation's racks
 * does not modernise it. Tier upgrades remain the paid route.
 */
async function applyDefenceRefitInTransaction(db: Db, countryId: string): Promise<RefitResult> {
  const unitsCol = getMilitaryUnitsCollection(db);
  const units = await unitsCol
    .find(
      { countryId: countryId as CountryId },
      {
        projection: { _id: 1, countryId: 1, domain: 1, type: 1, equipment: 1, integrity: 1 },
      }
    )
    .toArray();
  if (units.length === 0) return { unitsRefitted: 0, lotsUsed: 0 };

  const arsenal = await getNationalArsenal(db, countryId);
  // Nothing in store anywhere — skip before touching a single unit.
  if (!Object.values(arsenal.stock).some((v) => v > 0)) {
    return { unitsRefitted: 0, lotsUsed: 0 };
  }

  const ops: AnyBulkWriteOperation<MilitaryUnit>[] = [];
  let lotsUsed = 0;
  // Allocate against the transaction snapshot, then draw each domain once.
  const drawnByDomain = new Map<string, number>();

  // Grouped by domain because each domain draws from its own store: a full armoury does not
  // help a starved navy, which is the whole point of a per-domain arsenal.
  const byDomain = new Map<string, MilitaryUnit[]>();
  for (const u of units) {
    if (!byDomain.has(u.domain)) byDomain.set(u.domain, []);
    byDomain.get(u.domain)!.push(u);
  }

  for (const [domain, domainUnits] of byDomain) {
    if ((arsenal.stock[domain as keyof typeof arsenal.stock] ?? 0) <= 0) continue;

    for (const unit of refitOrder(domainUnits)) {
      const archetype = getUnitArchetype(unit.domain, unit.type);
      // An unrecognised archetype has no known materiel requirement; leave it alone rather
      // than guessing one.
      if (!archetype) continue;

      const needed = lotsToFillUnit(unit, lotsRequired(archetype));
      if (needed <= 0) continue;

      const drawn = Math.min(
        needed,
        Math.max(0, arsenal.stock[unit.domain] - (drawnByDomain.get(unit.domain) ?? 0))
      );
      if (drawn <= 0) break; // this domain's store is exhausted

      const fullLots = lotsRequired(archetype);
      // Preserve the sub-track value of every lot and redirect it toward tracks that
      // still need equipment. Rounding per track would consume small deliveries
      // without changing the unit.
      const equipment = applyEquipmentLots(unit.equipment, drawn, fullLots);

      ops.push({
        updateOne: {
          filter: { _id: unit._id },
          update: {
            $set: {
              equipment,
            },
          },
        },
      });
      lotsUsed += drawn;
      drawnByDomain.set(unit.domain, (drawnByDomain.get(unit.domain) ?? 0) + drawn);
    }
  }

  for (const [domain, lots] of drawnByDomain) {
    const drawn = await drawLots(db, countryId, domain as MilitaryUnit["domain"], lots);
    if (drawn !== lots) throw new Error("Arsenal changed during equipment allocation");
  }
  if (ops.length > 0) {
    const result = await unitsCol.bulkWrite(ops);
    if (result.matchedCount !== ops.length)
      throw new Error("Military formations changed during equipment delivery");
  }
  return { unitsRefitted: ops.length, lotsUsed };
}

/** A country receipt binds consumed lots to their delivered equipment for this turn. */
export async function applyDefenceRefit(
  db: Db,
  countryId: string,
  _knownUnits?: MilitaryUnit[],
  turn?: number
): Promise<RefitResult> {
  const settledTurn = turn ?? (await getCurrentTurn(db));
  return withTurnValueSettlement(
    db,
    "defence-refit",
    settledTurn,
    (db) => applyDefenceRefitInTransaction(db, countryId),
    { sourceKey: `${countryId}:${settledTurn}` }
  );
}
