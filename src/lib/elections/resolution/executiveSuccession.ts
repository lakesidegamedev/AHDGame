/**
 * Succession watcher for national executives outside the US.
 *
 * Opens a succession record on the government document when the head of
 * government or state falls vacant, marks it overdue past its fill deadline,
 * clears it once someone holds the office, and promotes a deputy in countries
 * whose rule is a permanent deputy. Election and party-vote fills stay with the
 * existing formation and election engines; this records the timetable they owe.
 */

import type { AnyBulkWriteOperation, Db } from "mongodb";
import {
  COUNTRY_CONFIGS,
  getCountryConfig,
  isParliamentarySystem,
} from "@/lib/constants/countries";
import type { CountryConfig, CountryId } from "@/lib/constants/countries";
import { getFullSimulationCountryIds } from "@/lib/country/countryTier";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getGameStateCollection } from "@/lib/db/collections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import type {
  ExecutiveSuccessionState,
  GovernmentFormation,
} from "@/lib/db/types/governmentFormation";
import {
  getSuccessionRule,
  type SuccessionRule,
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
  const rules = new Map<CountryId, { rule: SuccessionRule; config: CountryConfig }>();
  for (const countryId of await getFullSimulationCountryIds(db)) {
    if (countryId === COUNTRY_CONFIGS.US.id) continue;
    try {
      const config = getCountryConfig(countryId, preset);
      rules.set(countryId, { rule: getSuccessionRule(countryId, config.governmentType), config });
    } catch (err) {
      logger.error("Turn", `Executive succession has no rule for ${countryId}`, err);
    }
  }
  if (rules.size === 0) return result;

  const govCol = getGovernmentFormationsCollection(db);
  const govs = new Map(
    (await govCol.find({ _id: { $in: [...rules.keys()] } }).toArray()).map((g) => [g._id, g])
  );
  const offices = [...new Set([...rules.values()].map(({ rule }) => rule.office))];
  const officeRows = await (
    await getElectedOfficialsCollection(db)
  )
    .find(
      { officeType: { $in: offices } },
      { projection: { officeType: 1, countryId: 1, characterId: 1, nppId: 1 } }
    )
    .toArray();

  const ops: AnyBulkWriteOperation<GovernmentFormation>[] = [];
  const promotable: CountryId[] = [];
  for (const [countryId, { rule, config }] of rules) {
    const gov = govs.get(countryId);
    if (!gov) continue;
    let vacant: boolean;
    if (isParliamentarySystem(config)) {
      vacant = gov.status === "pending" && !gov.pmCharacterId && !gov.pmNppId;
    } else {
      const row = officeRows.find((o) => o.officeType === rule.office && o.countryId === countryId);
      if (!row) continue;
      vacant = row.characterId == null && row.nppId == null;
    }

    if (!vacant) {
      if (gov.succession) {
        ops.push({
          updateOne: { filter: { _id: countryId }, update: { $unset: { succession: "" } } },
        });
        result.cleared++;
      }
      continue;
    }
    if (rule.fill === "deputy_permanent" && config.governmentType === "presidential") {
      promotable.push(countryId);
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
      ops.push({
        updateOne: {
          filter: { _id: countryId },
          update: { $set: { succession: state, updatedAt: now } },
        },
      });
      result.opened++;
    } else if (!existing.overdue && successionStage(existing, currentTurn) === "overdue") {
      ops.push({
        updateOne: {
          filter: { _id: countryId },
          update: { $set: { "succession.overdue": true, updatedAt: now } },
        },
      });
      logger.warn(
        "Turn",
        `Executive succession overdue in ${countryId}: ${existing.office} vacant since turn ${existing.vacatedTurn}`
      );
      result.overdue++;
    }
  }
  if (ops.length > 0) await govCol.bulkWrite(ops, { ordered: false });

  const promoted: CountryId[] = [];
  for (const countryId of promotable) {
    try {
      if (await processPresidentialSuccession(db, countryId)) promoted.push(countryId);
    } catch (err) {
      logger.error("Turn", `Executive succession promotion failed for ${countryId}`, err);
    }
  }
  if (promoted.length > 0) {
    await govCol.updateMany({ _id: { $in: promoted } }, { $unset: { succession: "" } });
    result.promoted = promoted.length;
  }
  return result;
}

/** US presidential succession followed by the succession watcher for every other country. */
export async function processSuccessions(db: Db, currentTurn: number, now: Date): Promise<void> {
  await processPresidentialSuccession(db);
  await processExecutiveSuccession(db, currentTurn, now);
}
