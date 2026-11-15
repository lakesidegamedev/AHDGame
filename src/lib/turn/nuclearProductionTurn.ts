import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { accrueWarheads, productionCapFor } from "@/lib/military/nuclearProgram";
import { getNuclearProgram, putNuclearProgram } from "@/lib/db/collections/nuclearPrograms";
import {
  creditAppropriation,
  debitAppropriation,
  getDefenseAppropriation,
  uncommittedFrom,
} from "@/lib/db/collections/defenseAppropriation";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export interface NuclearProductionResult {
  warheadsBuilt: number;
  spent: number;
}

const NOTHING: NuclearProductionResult = { warheadsBuilt: 0, spent: 0 };

/**
 * Per-turn: build ordered warheads from the defence appropriation, sharing it
 * with recruit/refit/contract flows.
 *
 * Money conservation: size against the UNCOMMITTED balance (never reserved
 * contract money), debit via guarded `debitAppropriation` so concurrent spends
 * fail cleanly rather than overdraw, then credit the stockpile. If the
 * programme write fails, refund the debit.
 *
 * `accrueWarheads` clamps the rate to the adopted device tier cap and affordable
 * balance, so a starved budget builds fewer or zero warheads, never arrears.
 *
 * Skips while `defenceProcurementPaused`. `_year` is reserved
 * for era-priced production.
 */
export async function applyNuclearProduction(
  db: Db,
  countryId: CountryId,
  _year: number,
  _turn: number,
  preloadedGameState?: { defenceProcurementPaused?: boolean }
): Promise<NuclearProductionResult> {
  const gs =
    preloadedGameState ??
    (await gameStateCollection<{ _id: string; defenceProcurementPaused?: boolean }>(db).findOne(
      { _id: "current" },
      { projection: { defenceProcurementPaused: 1 } }
    )) ??
    {};
  if (gs.defenceProcurementPaused === true) return NOTHING;

  const program = await getNuclearProgram(db, countryId);
  if (program.productionRate <= 0) return NOTHING;
  if (productionCapFor(program.adopted) <= 0) return NOTHING;

  const pot = await getDefenseAppropriation(db, countryId);
  const available = Math.max(0, uncommittedFrom(pot));
  const { built, cost } = accrueWarheads(program.adopted, program.productionRate, available);
  if (built <= 0) return NOTHING;

  // Guarded debit: a concurrent order between our read and this write makes it
  // return false, and we build nothing rather than mint unpaid-for warheads.
  const paid = await debitAppropriation(db, countryId, cost);
  if (!paid) return NOTHING;

  try {
    await putNuclearProgram(db, { ...program, warheads: program.warheads + built });
  } catch (error) {
    await creditAppropriation(db, countryId, cost);
    throw error;
  }
  return { warheadsBuilt: built, spent: cost };
}
