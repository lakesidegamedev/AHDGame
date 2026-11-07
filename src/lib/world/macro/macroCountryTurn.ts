import { arabTradeMultiplier } from "@/lib/livingConflict/rules/arabRegional";
import type { LivingConflictState } from "@/lib/livingConflict/types";
import {
  crisisEconomicExposure,
  crisisMacroOutputMultiplier,
} from "@/lib/livingConflict/rules/economicExposure";
import type { Db } from "mongodb";
import { getMacroCountriesCollection } from "@/lib/db/collections/macroCountries";
import { computeMacroContribution } from "./kernel";
import { ACTIVE_MACRO_COUNTRY_FILTER, isActiveMacroCountry } from "./retirement";
import { isMacroTickTurn, MACRO_TICK_INTERVAL } from "./schedule";
import { advanceMacroGrowth } from "./rules/growth";
import { scaleMacroCapacity, tradeCapacityFactorAtTick } from "./rules/tradeFeedback";
import { MACRO_TURNS_PER_YEAR } from "./seedBuilder";
import {
  advanceBackgroundNation,
  isBackgroundNation,
  loadBackgroundNationContext,
  type BackgroundNationUpdate,
} from "./backgroundNation";
import { macroAggregateOutput } from "./rules/backgroundBudget";
import { markNationalIndexFunds, type NationalIndexMark } from "./nationalIndexFunds";
import {
  applyBackgroundForeignPolicy,
  loadBackgroundForeignContext,
  planBackgroundForeignPolicy,
  type ForeignPolicyPlan,
} from "./backgroundForeignPolicy";

export interface MacroCountryTurnResult {
  countriesConsidered: number;
  countriesUpdated: number;
  updatedEntityIds: string[];
  /** Background countries that held a national election this tick (#5702). */
  nationalElections?: string[];
  /** Scripted foreign policy actions this tick (#5702 section 5). */
  foreignPolicy?: Awaited<ReturnType<typeof applyBackgroundForeignPolicy>>;
}

/**
 * Refresh sphere-macro kernels on their deterministic six-turn schedule.
 * Non-tick turns are a no-op; held contributions stay as last computed.
 */
export async function processMacroCountryTurn(
  db: Db,
  turn: number
): Promise<MacroCountryTurnResult> {
  const collection = await getMacroCountriesCollection(db);
  const tickBucket = (turn - 1) % MACRO_TICK_INTERVAL;
  const countries = await collection.find({ tickBucket, ...ACTIVE_MACRO_COUNTRY_FILTER }).toArray();
  const updatedEntityIds: string[] = [];
  const nationalElections: string[] = [];
  let foreignPolicy: MacroCountryTurnResult["foreignPolicy"];
  const now = new Date();

  for (const country of countries) {
    // Retained as an invariant check and for simple test/in-memory adapters
    // that do not implement Mongo filters.
    if (!isActiveMacroCountry(country)) continue;
    if (!isMacroTickTurn(turn, country.entityId)) continue;
    updatedEntityIds.push(country.entityId);
  }
  const due = countries.filter(
    (country) => isActiveMacroCountry(country) && isMacroTickTurn(turn, country.entityId)
  );
  if (due.length > 0) {
    const config = await db
      .collection("gameState")
      .findOne(
        { _id: "current" as never },
        { projection: { livingConflictsEnabled: 1, currentYear: 1, resetWorldId: 1 } }
      );
    // 2027 background countries: national politics, budget state and index (#5702).
    const nationContext = await loadBackgroundNationContext(db, due, {
      year: config?.currentYear,
      worldSeed: String(config?.resetWorldId ?? "world"),
      turnsPerYear: MACRO_TURNS_PER_YEAR,
    });
    const indexMarks: NationalIndexMark[] = [];
    // Scripted foreign policy for the same countries (#5702 section 5).
    const foreignContext = nationContext
      ? await loadBackgroundForeignContext(db, due.filter(isBackgroundNation), turn, {
          livingConflictsEnabled: config?.livingConflictsEnabled === true,
        })
      : null;
    const foreignPlans: ForeignPolicyPlan[] = [];
    const crisis = config?.livingConflictsEnabled
      ? await db
          .collection<LivingConflictState>("livingConflicts")
          .find(
            {
              defKey: {
                $in: ["yugoslav_dissolution", "russia_ukraine_security", "arab_uprisings"],
              },
            },
            {
              projection: {
                defKey: 1,
                hasOpened: 1,
                status: 1,
                tracks: 1,
                representedActors: 1,
                arabRegional: 1,
                realizedInfrastructureDamage: 1,
              },
            }
          )
          .toArray()
      : [];
    await collection.bulkWrite(
      due.map((country) => {
        const exposure = crisisEconomicExposure(
          crisis,
          { _id: country.entityId, countryId: country.entityId },
          country.livingConflictExposure,
          turn,
          MACRO_TICK_INTERVAL
        );
        const persistExposure =
          country.livingConflictExposure ||
          exposure.displacedShare > 0 ||
          exposure.hostingShare > 0 ||
          exposure.infrastructureDamage > 0;
        const baseShock =
          Number.isFinite(country.shockModifier) && country.shockModifier > 0
            ? country.shockModifier
            : 1;
        const shockModifier =
          baseShock *
          crisisMacroOutputMultiplier(exposure) *
          arabTradeMultiplier(
            crisis?.find((state) => state.defKey === "arab_uprisings"),
            country.entityId
          );
        // Annual trend growth since the last tick (2027 background countries;
        // documents without a trend return null and keep their sectors).
        const trendSectors = advanceMacroGrowth({
          sectors: country.sectors,
          trendGrowth: country.trendGrowth,
          shockModifier,
          lastTickTurn: country.lastMacroTickTurn,
          turn,
          turnsPerYear: MACRO_TURNS_PER_YEAR,
        });
        // Capacity follows the exports that really sold on funded turns since
        // the last tick (background countries only; 1 everywhere else).
        const tradeFactor = tradeCapacityFactorAtTick({
          fundedTrade: country.fundedTrade,
          lastTickTurn: country.lastMacroTickTurn,
          tradeExposure: country.tradeExposure,
        });
        const grownSectors =
          tradeFactor === 1
            ? trendSectors
            : scaleMacroCapacity(trendSectors ?? country.sectors, tradeFactor);
        const nation: BackgroundNationUpdate | null = nationContext
          ? advanceBackgroundNation(
              country,
              nationContext,
              turn,
              macroAggregateOutput(grownSectors ?? country.sectors)
            )
          : null;
        if (nation?.indexMark) indexMarks.push(nation.indexMark);
        if (nation?.events.some((event) => event.kind === "election")) {
          nationalElections.push(country.entityId);
        }
        const foreignPlan =
          foreignContext && isBackgroundNation(country)
            ? planBackgroundForeignPolicy(
                country,
                nation?.set.nationalPolitics ?? country.nationalPolitics,
                foreignContext,
                turn
              )
            : null;
        if (foreignPlan) foreignPlans.push(foreignPlan);
        return {
          updateOne: {
            filter: { _id: country._id },
            update: {
              $set: {
                ...(grownSectors ? { sectors: grownSectors } : {}),
                contribution: computeMacroContribution(
                  {
                    ...country,
                    ...(grownSectors ? { sectors: grownSectors } : {}),
                    shockModifier,
                  },
                  turn
                ),
                ...(persistExposure ? { livingConflictExposure: exposure } : {}),
                ...(nation?.set ?? {}),
                ...(foreignPlan ? { foreignPolicy: foreignPlan.state } : {}),
                lastMacroTickTurn: turn,
                updatedAt: now,
              },
            },
          },
        };
      }),
      { ordered: false }
    );
    await markNationalIndexFunds(db, indexMarks, turn, now);
    if (foreignContext && foreignPlans.length > 0) {
      foreignPolicy = await applyBackgroundForeignPolicy(
        db,
        foreignPlans,
        foreignContext,
        turn,
        now
      );
    }
  }

  return {
    countriesConsidered: countries.length,
    countriesUpdated: updatedEntityIds.length,
    updatedEntityIds,
    ...(nationalElections.length > 0 ? { nationalElections } : {}),
    ...(foreignPolicy ? { foreignPolicy } : {}),
  };
}
