import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { getMilitaryUnitsCollection } from "@/lib/db/collections/militaryUnits";
import { getUnitArchetype } from "@/lib/constants/military";
import { getNationalArsenal, drawLots, returnLots } from "@/lib/db/collections/nationalArsenal";
import { lotsRequired, lotsToRepair, repairOrder } from "@/lib/military/arsenal";
import { FREE_REPAIR_CEILING } from "@/lib/navair/repair";

export interface NavalRepairResult {
  unitsRepaired: number;
  lotsUsed: number;
}

/**
 * Per-turn: buy back hull and airframe condition with materiel from the national arsenal.
 *
 * The paid tier of repair. Free repair (naval and air pass) is capped by basing: a home
 * port fully restores, an allied port most of the way, holding station well short of full.
 *
 * Not gated on basing, and once started it has no ceiling: a forward hull bought out of
 * the hole is carried to full without going home. That is the point of the tier.
 *
 * Entry threshold: nothing ABOVE the station ceiling is touched, because a lot buys one
 * point up there versus a hundred at the bottom, and without it this sweep would drain
 * the store on scratches and starve `applyDefenceRefit`, which runs right after. A
 * formation exactly ON the ceiling IS eligible, since free repair parks forward hulls
 * there. Consequence: a formation between the ceiling and full that is not resting
 * somewhere better stays there; it fights fine and a home port fixes it for free.
 *
 * Runs BEFORE `applyDefenceRefit` deliberately: a wreck restored to service is worth
 * more per lot than topping up racks, which `computeEffectivePower` caps at a few
 * percent. When the store is short, lots go where they buy the most fighting strength.
 *
 * Naval and air only; no other domain carries `integrity`.
 */
export async function applyNavalRepair(
  db: Db,
  countryId: string,
  knownUnits?: MilitaryUnit[]
): Promise<NavalRepairResult> {
  const unitsCol = getMilitaryUnitsCollection(db);
  const units = knownUnits
    ? knownUnits.filter((unit) => unit.domain === "naval" || unit.domain === "air")
    : await unitsCol
        .find({ countryId: countryId as CountryId, domain: { $in: ["naval", "air"] } })
        .toArray();
  if (units.length === 0) return { unitsRepaired: 0, lotsUsed: 0 };

  const arsenal = await getNationalArsenal(db, countryId);
  // Nothing in either store anywhere — skip before touching a single unit.
  if (!(arsenal.stock.naval > 0 || arsenal.stock.air > 0)) {
    return { unitsRepaired: 0, lotsUsed: 0 };
  }

  const ops: AnyBulkWriteOperation<MilitaryUnit>[] = [];
  let lotsUsed = 0;
  /** Lots taken per domain this turn, so a failed write can put them back. */
  const drawnByDomain = new Map<string, number>();

  // Grouped by domain because each draws from its own store: a full aircraft store does
  // not help a wrecked fleet, which is the whole point of a per-domain arsenal.
  const byDomain = new Map<string, MilitaryUnit[]>();
  for (const u of units) {
    if (!byDomain.has(u.domain)) byDomain.set(u.domain, []);
    byDomain.get(u.domain)!.push(u);
  }

  for (const [domain, domainUnits] of byDomain) {
    if ((arsenal.stock[domain as keyof typeof arsenal.stock] ?? 0) <= 0) continue;

    for (const unit of repairOrder(domainUnits)) {
      const archetype = getUnitArchetype(unit.domain, unit.type);
      // An unrecognised archetype has no known materiel requirement; leave it alone rather
      // than guessing one.
      if (!archetype) continue;

      const integrity = unit.integrity ?? 100;

      // Materiel is only spent where free repair cannot finish the job. Well above the
      // station ceiling a lot buys a single point of condition against a hundred at the
      // bottom, so an unconditional sweep would drain the store on scratches and starve
      // refit, which runs immediately after this.
      //
      // At the ceiling EXACTLY is the important case, and the reason this is `>` and not
      // `>=`. Free repair parks every forward-deployed hull on precisely this number and
      // then stops. A `>=` gate therefore excluded the one formation the paid tier exists
      // for: a fleet that mended itself as far as it could while the arsenal was empty
      // could never spend the materiel once it finally arrived, and would sit at the
      // ceiling for ever.
      if (integrity > FREE_REPAIR_CEILING.station) continue;

      const needed = lotsToRepair(unit, lotsRequired(archetype));
      if (needed <= 0) continue;

      const drawn = await drawLots(db, countryId, unit.domain, needed);
      if (drawn <= 0) break; // this domain's store is exhausted

      // Proportional to what was actually drawn, never the full restore. Awarding full
      // condition for a partial draw is the same bug `applyEquipmentLots` exists to avoid
      // on the equipment side: materiel a nation paid for must buy exactly what it bought.
      const restored = ((100 - integrity) * drawn) / needed;

      ops.push({
        updateOne: {
          filter: { _id: unit._id },
          update: { $set: { integrity: Math.min(100, integrity + restored) } },
        },
      });
      lotsUsed += drawn;
      drawnByDomain.set(unit.domain, (drawnByDomain.get(unit.domain) ?? 0) + drawn);
    }
  }

  if (ops.length > 0) {
    try {
      await unitsCol.bulkWrite(ops);
    } catch (error) {
      // Lots are drawn per unit but written in one batch, so a failed write would
      // otherwise destroy every lot taken this turn with nothing issued for them. Put them
      // back before rethrowing — materiel a nation paid for must not evaporate because a
      // write failed.
      for (const [domain, lots] of drawnByDomain) {
        await returnLots(db, countryId, domain as MilitaryUnit["domain"], lots);
      }
      throw error;
    }
  }
  return { unitsRepaired: ops.length, lotsUsed };
}
