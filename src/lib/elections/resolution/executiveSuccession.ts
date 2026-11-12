/**
 * Succession watcher for national executives outside the US.
 *
 * Opens a succession record on the government document when the head of
 * government or state falls vacant, marks it overdue past its fill deadline,
 * clears it once someone holds the office, and promotes a deputy in countries
 * whose rule is a permanent deputy. Special elections and legislature or party
 * votes are spawned by executiveSuccessionFill.
 */

import type { AnyBulkWriteOperation, Db } from "mongodb";
import { getCountryConfig, isParliamentarySystem } from "@/lib/constants/countries";
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
  deputyUnavailableRule,
  getSuccessionRule,
  type SuccessionRule,
  openExecutiveVacancy,
  successionStage,
} from "@/lib/elections/rules/executiveSuccession";
import { postSuccessionNews } from "@/lib/elections/resolution/successionNews";
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
  const offices = [
    ...new Set(
      [...rules.values()].flatMap(({ rule }) =>
        rule.actingOffice && rule.fill === "deputy_permanent"
          ? [rule.office, rule.actingOffice]
          : [rule.office]
      )
    ),
  ];
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
  const news: Array<Parameters<typeof postSuccessionNews>> = [];
  for (const [countryId, { rule: baseRule, config }] of rules) {
    const gov = govs.get(countryId);
    if (!gov) continue;
    let vacant: boolean;
    if (isParliamentarySystem(config)) {
      vacant = gov.status === "pending" && !gov.pmCharacterId && !gov.pmNppId;
    } else {
      const row = officeRows.find(
        (o) => o.officeType === baseRule.office && o.countryId === countryId
      );
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
    // A permanent deputy only helps when one is seated. With the deputy seat
    // empty too (a double vacancy) the office goes to a special election.
    let rule = baseRule;
    if (baseRule.fill === "deputy_permanent" && config.governmentType === "presidential") {
      const deputy = officeRows.find(
        (o) => o.officeType === baseRule.actingOffice && o.countryId === countryId
      );
      if (deputy && (deputy.characterId != null || deputy.nppId != null)) {
        promotable.push(countryId);
      } else {
        rule = deputyUnavailableRule(baseRule);
      }
    }
    const existing = gov.succession;
    if (existing?.fill === "deputy_permanent" && rule.fill === "direct_election") {
      // The deputy left or was barred after the record opened: re-plan from the original vacancy.
      const vacancy = openExecutiveVacancy(rule, existing.vacatedTurn);
      ops.push({
        updateOne: {
          filter: { _id: countryId },
          update: {
            $set: {
              "succession.fill": rule.fill,
              "succession.actingLabel": rule.actingLabel,
              "succession.actingUntilTurn": vacancy.actingUntilTurn,
              "succession.fillByTurn": vacancy.fillByTurn,
              updatedAt: now,
            },
          },
        },
      });
    } else if (!existing) {
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
      news.push([
        countryId,
        { event: "vacancy", office: rule.office, actingLabel: rule.actingLabel },
      ]);
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
      news.push([countryId, { event: "overdue", office: existing.office }]);
    }
  }
  if (ops.length > 0) await govCol.bulkWrite(ops, { ordered: false });
  for (const [countryId, input] of news) await postSuccessionNews(countryId, input);

  const promoted: CountryId[] = [];
  const barred: CountryId[] = [];
  for (const countryId of promotable) {
    try {
      if (await processPresidentialSuccession(db, countryId)) promoted.push(countryId);
      else barred.push(countryId);
    } catch (err) {
      logger.error("Turn", `Executive succession promotion failed for ${countryId}`, err);
    }
  }
  if (promoted.length > 0) {
    await govCol.updateMany({ _id: { $in: promoted } }, { $unset: { succession: "" } });
    result.promoted = promoted.length;
  }
  // A deputy who is seated but barred from the office (term limit) cannot take over either.
  const barredDocs =
    barred.length > 0
      ? await govCol.find({ _id: { $in: barred } }, { projection: { succession: 1 } }).toArray()
      : [];
  const barredOps: typeof ops = [];
  const openByCountry = new Map(barredDocs.map((d) => [String(d._id), d.succession]));
  for (const countryId of barred) {
    const base = rules.get(countryId)?.rule;
    const open = openByCountry.get(countryId);
    if (!base || open?.fill !== "deputy_permanent") continue;
    const rule = deputyUnavailableRule(base);
    const vacancy = openExecutiveVacancy(rule, open.vacatedTurn);
    barredOps.push({
      updateOne: {
        filter: { _id: countryId },
        update: {
          $set: {
            "succession.fill": rule.fill,
            "succession.actingLabel": rule.actingLabel,
            "succession.actingUntilTurn": vacancy.actingUntilTurn,
            "succession.fillByTurn": vacancy.fillByTurn,
            updatedAt: now,
          },
        },
      },
    });
  }
  if (barredOps.length > 0) await govCol.bulkWrite(barredOps, { ordered: false });
  return result;
}

/** US presidential succession followed by the succession watcher for every other country. */
export async function processSuccessions(db: Db, currentTurn: number, now: Date): Promise<void> {
  await processPresidentialSuccession(db);
  await processExecutiveSuccession(db, currentTurn, now);
}
