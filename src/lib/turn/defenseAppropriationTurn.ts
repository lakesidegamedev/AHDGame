import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getMilitaryUnitsCollection } from "@/lib/db/collections/militaryUnits";
import { getCabinetSettingsCollection } from "@/lib/db/collections/cabinetSettings";
import { aggregateForce, DEFENSE_POSITION_BY_COUNTRY } from "@/lib/constants/military";
import {
  accrualPerTurn,
  upkeepPerTurn,
  overdraftFloor,
  settleAppropriation,
  type AppropriationSettlement,
} from "@/lib/military/appropriation";
import { resolveSeedRosterUpkeep } from "@/lib/military/seedRosterUpkeepPin";
import { resolveDefenseLineFrom } from "./defenseEnvelope";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import {
  getDefenseAppropriation,
  applyAppropriationSettlementWithOverdraft,
} from "@/lib/db/collections/defenseAppropriation";
import { applyReadinessDrift } from "./militaryForceEffects";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

export class DefenseAppropriationContentionError extends Error {
  readonly retryable = true;

  constructor(countryId: string, turn: number) {
    super(`Defense appropriation contention for ${countryId} at turn ${turn}; retry required`);
    this.name = "DefenseAppropriationContentionError";
  }
}

/**
 * Per-turn defence account sweep: accrue this turn's slice of the enacted defence line,
 * fund upkeep as balance and overdraft allow, draw overdraft as national debt, and
 * persist the arrears ratio that suppresses readiness.
 *
 * Runs for EVERY country with units, seat or not, to match `applyReinforcement`.
 * Readiness drift lives here so seatless nations are charged and drifted consistently,
 * and the consumer reads the ratio this step just computed.
 *
 * Returns null when there is nothing to do (no units, or already accrued this turn).
 */
export async function applyDefenseAppropriation(
  db: Db,
  countryId: string,
  turn: number,
  preset: string,
  knownUnits?: MilitaryUnit[]
): Promise<AppropriationSettlement | null> {
  const units =
    knownUnits ??
    (await getMilitaryUnitsCollection(db)
      .find({ countryId: countryId as CountryId })
      .toArray());
  if (units.length === 0) return null;

  // The force tier scales upkeep AND the readiness baseline the drift below walks toward.
  // Countries with no defence seat have no cabinet setting and fall back to "standard",
  // which is what their force actually runs at.
  const positionId = DEFENSE_POSITION_BY_COUNTRY[countryId as CountryId];
  const setting = positionId
    ? await getCabinetSettingsCollection(db).findOne({ _id: `${countryId}_${positionId}` })
    : null;
  const tier = setting?.tierSetting ?? "standard";

  const { totalUpkeep } = aggregateForce(units, countryId, tier);
  // Retry the complete read/calculation after a CAS miss. Reusing a settlement
  // computed from a stale appropriation balance would silently overwrite a
  // concurrent player debit in the accounting result.
  let settlement: AppropriationSettlement | null = null;
  let settled = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const budget = await federalBudgetCollection(db).findOne({ countryId });
    if (!budget) return null;
    // An unmigrated budget must be seeded before settling. The seed is idempotent;
    // reload so the CAS includes the persisted pot value.
    if (!budget.defenseAppropriation) {
      await getDefenseAppropriation(db, countryId);
      continue;
    }
    const pot = budget.defenseAppropriation;
    if (pot.accruedThroughTurn >= turn) return null;
    const line = resolveDefenseLineFrom(budget);
    settlement = settleAppropriation(
      pot.balance,
      accrualPerTurn(line),
      upkeepPerTurn(totalUpkeep, await resolveSeedRosterUpkeep(db, preset, countryId), line),
      overdraftFloor(line)
    );
    settled = await applyAppropriationSettlementWithOverdraft(
      db,
      countryId,
      turn,
      settlement,
      budget.treasuryBalance ?? 0,
      pot.balance
    );
    if (settled) break;
  }
  if (!settlement) return null;
  if (!settled) throw new DefenseAppropriationContentionError(countryId, turn);
  // Only drift on the run that actually booked the turn. If the guarded write lost to a
  // concurrent turn pass, that pass has already drifted these units and doing it twice would
  // move readiness two steps in one turn.
  if (settled) await applyReadinessDrift(db, units, settlement.arrearsRatio, tier);
  return settlement;
}
