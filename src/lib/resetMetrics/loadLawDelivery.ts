/** Existing and replacement statutes use actual funded delivery, loaded in bounded batches. */
import type { Db } from "mongodb";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import type { StateBudget } from "@/lib/db/types/budget";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { isResetV2Country } from "@/lib/resetVersions/rules";
import { openingMetricPrograms } from "@/lib/metricEngine/rules/povertyOpening";
import type { MetricLawProgram, MetricLawSettlement } from "./rules/lawDelivery";

export async function loadMetricLawDelivery(
  db: Db,
  input: {
    worldId: string;
    turn: number;
    regions: readonly { _id: string; countryId: string }[];
    countryIds?: readonly string[];
  }
): Promise<{
  programs: MetricLawProgram[];
  opening: MetricLawProgram[];
  settlements: Map<string, MetricLawSettlement>;
}> {
  const { worldId, turn, regions } = input;
  const empty = { programs: [], opening: [], settlements: new Map<string, MetricLawSettlement>() };
  if (!worldId) return empty;
  const countries = [
    ...new Set(input.countryIds ?? regions.map((region) => region.countryId)),
  ].filter(isResetV2Country);
  if (!countries.length) return empty;
  const us = regions.filter((r) => r.countryId === "US").map((r) => r._id);
  const other = regions.filter((r) => r.countryId !== "US").map((r) => r._id);
  const [replacements, accounts, boards, regional, states] = await Promise.all([
    db
      .collection<ResetLawProgramDocument>("resetLawPrograms")
      .find(
        { worldId, country: { $in: countries }, effectiveTurn: { $lte: turn } },
        {
          projection: {
            _id: 1,
            country: 1,
            scope: 1,
            regionId: 1,
            familyId: 1,
            fundingAccountId: 1,
            effectiveTurn: 1,
            choice: 1,
            annualAgencyAllocation: 1,
            primaryMetricEffects: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts")
      .find(
        { worldId, countryId: { $in: countries } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            accruedThroughTurn: 1,
            familyAnnualDemand: 1,
            lastProgramDelivery: 1,
            externallySettled: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<ResetLawOpeningBoard>("resetLawOpeningBoards")
      .find(
        { worldId, countryId: { $in: countries } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            scope: 1,
            regionId: 1,
            sourceTurn: 1,
            ...Object.fromEntries(
              resetLawFamilies.flatMap((f) =>
                [
                  "status",
                  "sourceComponents.sourceId",
                  "sourceComponents.optionIndex",
                  "sourceComponents.annualBooked",
                ].map((field) => [`references.${f.id}.${field}`, 1])
              )
            ),
          },
        }
      )
      .toArray(),
    other.length
      ? db
          .collection<RegionalBudget>("regionalBudgets")
          .find(
            { _id: { $in: other }, countryId: { $in: countries } },
            { projection: { _id: 1, countryId: 1, programSettlements: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
    us.length
      ? db
          .collection<StateBudget>("stateBudgets")
          .find(
            { _id: { $in: us }, countryId: "US" },
            { projection: { _id: 1, countryId: 1, regionalProgramSettlements: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
  ]);
  const active = replacements.filter(
    (p) => p.effectiveTurn <= turn && countries.includes(p.country)
  );
  const familyIds = resetLawFamilies.map((family) => family.id);
  const opening = openingMetricPrograms({ worldId, boards, replacements: [], accounts, familyIds });
  const inherited = openingMetricPrograms({
    worldId,
    boards,
    replacements: active,
    accounts,
    familyIds,
  });
  const programs: MetricLawProgram[] = [...active, ...inherited];
  const byAccount = new Map(accounts.map((account) => [account._id, account]));
  const byRegion = new Map<
    string,
    { countryId?: string; settlements: Record<string, MetricLawSettlement> }
  >();
  for (const row of regional)
    byRegion.set(String(row._id), {
      countryId: row.countryId,
      settlements: row.programSettlements ?? {},
    });
  for (const row of states)
    byRegion.set(String(row._id), {
      countryId: row.countryId,
      settlements: row.regionalProgramSettlements ?? {},
    });
  const settlements = new Map<string, MetricLawSettlement>();
  for (const program of programs) {
    if (program.scope === "national") {
      const account = byAccount.get(program.fundingAccountId);
      if (account?.countryId !== program.country) continue;
      const family = account.lastProgramDelivery?.[program.familyId];
      // External settlement is explicit evidence, never a missing-data default.
      if (family || (account.externallySettled && account.accruedThroughTurn === turn)) {
        settlements.set(program._id, {
          implementationFactor: family?.implementationFactor ?? 1,
          lastSettledTurn: account.accruedThroughTurn,
        });
      }
    } else if (program.regionId) {
      const budget = byRegion.get(program.regionId);
      if (budget?.countryId !== program.country) continue;
      const paid = program.settlementLawId
        ? Object.values(budget.settlements).find(
            (row) => row.legislationTypeId === program.settlementLawId
          )
        : budget.settlements[program._id];
      if (paid) settlements.set(program._id, paid);
    }
  }
  return { programs, opening, settlements };
}
