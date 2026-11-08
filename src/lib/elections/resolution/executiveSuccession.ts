/**
 * Succession watcher for national executives outside the US.
 *
 * Opens a succession record on the government document when the head of
 * government or state falls vacant, marks it overdue past its fill deadline,
 * clears it once someone holds the office, and promotes a deputy in countries
 * whose rule is a permanent deputy. Election and party-vote fills stay with the
 * existing formation and election engines; this records the timetable they owe.
 */

import type { Db } from "mongodb";
import {
  COUNTRY_CONFIGS,
  getCountryConfig,
  isParliamentarySystem,
} from "@/lib/constants/countries";
import type { CountryId } from "@/lib/constants/countries";
import { getFullSimulationCountryIds } from "@/lib/country/countryTier";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getGameStateCollection } from "@/lib/db/collections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import type { ExecutiveSuccessionState } from "@/lib/db/types/governmentFormation";
import {
  getSuccessionRule,
  openExecutiveVacancy,
  successionStage,
} from "@/lib/elections/rules/executiveSuccession";
import { processPresidentialSuccession } from "@/lib/turn/presidentialSuccession";
import { logger } from "@/lib/observability/logger";

export interface ExecutiveSuccessionResult {
  opened: number;
  cleared: number;
  overdue: number;
  promoted: number;
}

export async function processExecutiveSuccession(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<ExecutiveSuccessionResult> {
  const result: ExecutiveSuccessionResult = { opened: 0, cleared: 0, overdue: 0, promoted: 0 };
  const gameState = await (
    await getGameStateCollection(db)
  ).findOne({ _id: "current" }, { projection: { preIteration: 1 } });
  // Founding seats every office at once; there is nothing to succeed.
  if (gameState?.preIteration?.active) return result;

  const preset = await getGameStatePreset(db);
  const govCol = getGovernmentFormationsCollection(db);

  for (const countryId of await getFullSimulationCountryIds(db)) {
    if (countryId === COUNTRY_CONFIGS.US.id) continue;
    try {
      const config = getCountryConfig(countryId, preset);
      const rule = getSuccessionRule(countryId, config.governmentType);
      const gov = await govCol.findOne({ _id: countryId });
      if (!gov) continue;

      const vacant = await isExecutiveVacant(db, countryId, rule.office, gov, config);
      if (vacant === null) continue;

      if (!vacant) {
        if (gov.succession) {
          await govCol.updateOne({ _id: countryId }, { $unset: { succession: "" } });
          result.cleared++;
        }
        continue;
      }

      if (rule.fill === "deputy_permanent" && config.governmentType === "presidential") {
        if (await processPresidentialSuccession(db, countryId)) {
          await govCol.updateOne({ _id: countryId }, { $unset: { succession: "" } });
          result.promoted++;
          continue;
        }
      }

      const existing = gov.succession;
      if (!existing) {
        const vacancy = openExecutiveVacancy(rule, currentTurn);
        const state: ExecutiveSuccessionState = {
          office: rule.office,
          fill: rule.fill,
          actingLabel: rule.actingLabel,
          vacatedTurn: vacancy.vacatedTurn,
          actingUntilTurn: vacancy.actingUntilTurn,
          fillByTurn: vacancy.fillByTurn,
          overdue: false,
        };
        await govCol.updateOne({ _id: countryId }, { $set: { succession: state, updatedAt: now } });
        result.opened++;
        continue;
      }
      if (!existing.overdue && successionStage(existing, currentTurn) === "overdue") {
        await govCol.updateOne(
          { _id: countryId },
          { $set: { "succession.overdue": true, updatedAt: now } }
        );
        logger.warn(
          "Turn",
          `Executive succession overdue in ${countryId}: ${existing.office} vacant since turn ${existing.vacatedTurn}`
        );
        result.overdue++;
      }
    } catch (err) {
      logger.error("Turn", `Executive succession failed for ${countryId}`, err);
    }
  }
  return result;
}

/** True/false when the office state is known, null when the country has no such office row. */
async function isExecutiveVacant(
  db: Db,
  countryId: CountryId,
  office: string,
  gov: { status?: string; pmCharacterId?: unknown; pmNppId?: unknown },
  config: ReturnType<typeof getCountryConfig>
): Promise<boolean | null> {
  if (isParliamentarySystem(config)) {
    return gov.status === "pending" && !gov.pmCharacterId && !gov.pmNppId;
  }
  const row = await (
    await getElectedOfficialsCollection(db)
  ).findOne({ officeType: office, ...officialsCountryScope(countryId) });
  if (!row) return null;
  return row.characterId == null && row.nppId == null;
}
