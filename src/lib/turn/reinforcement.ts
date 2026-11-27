import { withTurnValueSettlement } from "./withTurnValueSettlement";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { ClientSession, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getMilitaryUnitsCollection } from "@/lib/db/collections/militaryUnits";
import { getNationalManpower, setNationalManpower } from "@/lib/db/collections/nationalManpower";
import { reinforceUnit, manpowerCeiling } from "@/lib/military/manpower";
import { resolveConscriptionStanceFor } from "@/lib/military/conscriptionLaw";
import { ATTRITION } from "@/lib/military/config";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { boundSession } from "@/lib/db/sessionDb";
import { allocateReinforcements } from "@/lib/military/rules/reinforcementAllocation";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Per-turn replacement flow: regenerate the nation's manpower pool from its population
 * and conscription stance, then top up under-strength units and decrement the pool.
 *
 * Runs for EVERY country, including those with no defense seat — simulated nations must
 * sustain their forces too. That is why this is not folded into applyMilitaryForceEffects,
 * whose first act is to return early when there is no defense position.
 */
export async function applyReinforcement(
  db: Db,
  countryId: string,
  _knownUnits?: MilitaryUnit[],
  currentTurn?: number
): Promise<{ regenerated: number; reinforced: number; drawn: number }> {
  const turn =
    currentTurn ??
    (await gameStateCollection(db).findOne({ _id: "current" }, { projection: { currentTurn: 1 } }))
      ?.currentTurn ??
    0;
  return withTurnValueSettlement(
    db,
    "military-reinforcement",
    turn,
    (db) => reinforceInTransaction(db, countryId),
    { sourceKey: `${countryId}:${turn}` }
  );
}

async function reinforceInTransaction(
  db: Db,
  countryId: string
): Promise<{ regenerated: number; reinforced: number; drawn: number }> {
  const stance = await resolveConscriptionStanceFor(db, countryId);

  // The roster and pool share one snapshot, so delivery cannot overwrite newer losses.
  const states = await statesCollection<{ population?: number }>(db)
    .find({ countryId: countryId as CountryId }, { projection: { population: 1 } })
    .toArray();
  const population = states.reduce((a, s) => a + (s.population ?? 0), 0);
  const cap = manpowerCeiling(population, stance.poolMult);
  const regen = Math.floor(population * ATTRITION.manpowerRegenFraction * stance.poolMult);

  const apply = async (session?: ClientSession) => {
    const { pool, mode } = await getNationalManpower(db, countryId, session);
    let available = Math.min(cap, pool + regen);
    const regenerated = Math.max(0, available - pool);

    if (mode === "off") {
      if (regenerated > 0) {
        await setNationalManpower(db, countryId, { pool: available }, session);
      }
      return { regenerated, reinforced: 0, drawn: 0 };
    }

    // A nation whose stance forbids conscription reinforces with trained men instead.
    const effectiveMode = mode === "conscript" && !stance.conscriptAllowed ? "trained" : mode;
    const unitsCol = getMilitaryUnitsCollection(db);
    const units = await unitsCol
      .find({ countryId: countryId as CountryId }, { session })
      .sort({ _id: 1 })
      .toArray();
    const demands = units.map((unit) => ({
      id: String(unit._id),
      desired: reinforceUnit(unit, effectiveMode, Number.MAX_SAFE_INTEGER).drawn,
    }));
    const allocation = allocateReinforcements(demands, available);
    const ops = [];
    let drawn = 0;
    for (const u of units) {
      const r = reinforceUnit(u, effectiveMode, allocation.get(String(u._id)) ?? 0);
      if (r.drawn === 0) continue;
      available -= r.drawn;
      drawn += r.drawn;
      ops.push({
        updateOne: {
          filter: { _id: u._id },
          update: { $set: { personnel: r.personnel, vet: r.vet, xp: r.xp } },
        },
      });
    }
    if (ops.length) await unitsCol.bulkWrite(ops, session ? { session } : undefined);
    await setNationalManpower(db, countryId, { pool: available }, session);
    return { regenerated, reinforced: ops.length, drawn };
  };
  return apply(boundSession(db));
}
