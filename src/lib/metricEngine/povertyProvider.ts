/**
 * Poverty law delivery loads current enacted programs and their paid settlements.
 * loadPovertyPolicyInputs batches all countries and regions; missing funding
 * produces no relief, and Cabinet effects remain on their separate macro channel.
 */
import type { Db } from "mongodb";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import type { StateBudget } from "@/lib/db/types/budget";
import { isResetV2Country } from "@/lib/resetVersions/rules";
import type { ResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import { openingPovertyPrograms, POVERTY_FAMILY_IDS } from "./rules/povertyOpening";
import {
  povertyDeliveredPressure,
  type PovertyDelivery,
  type PovertyPolicyInput,
  type PovertyProgram,
} from "./rules/poverty";

export async function loadPovertyPolicyInputs(
  db: Db,
  input: {
    worldId: string;
    turn: number;
    regions: readonly { _id: string; countryId: string }[];
  }
): Promise<Map<string, PovertyPolicyInput>> {
  const { worldId, turn, regions } = input;
  if (!worldId || regions.length === 0) return new Map();
  const countryIds = [...new Set(regions.map((region) => region.countryId))].filter(
    isResetV2Country
  );
  const usIds = regions.filter((region) => region.countryId === "US").map((region) => region._id);
  const otherIds = regions
    .filter((region) => region.countryId !== "US")
    .map((region) => region._id);
  const [programs, accounts, regionalBudgets, openingBoards, stateBudgets] = await Promise.all([
    db
      .collection<ResetLawProgramDocument>("resetLawPrograms")
      .find(
        {
          worldId,
          country: { $in: countryIds },
          effectiveTurn: { $lte: turn },
          familyId: { $in: POVERTY_FAMILY_IDS },
        },
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
            primaryMetricEffects: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts")
      .find(
        { worldId, countryId: { $in: countryIds } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            accruedThroughTurn: 1,
            familyAnnualDemand: 1,
            lastProgramDelivery: 1,
          },
        }
      )
      .toArray(),
    otherIds.length
      ? db
          .collection<RegionalBudget>("regionalBudgets")
          .find(
            { _id: { $in: otherIds }, countryId: { $in: countryIds } },
            { projection: { _id: 1, countryId: 1, programSettlements: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
    db
      .collection<ResetLawOpeningBoard>("resetLawOpeningBoards")
      .find(
        { worldId, countryId: { $in: countryIds } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            scope: 1,
            regionId: 1,
            sourceTurn: 1,
            ...Object.fromEntries(POVERTY_FAMILY_IDS.map((id) => [`references.${id}`, 1])),
          },
        }
      )
      .toArray(),
    usIds.length
      ? db
          .collection<StateBudget>("stateBudgets")
          .find(
            { _id: { $in: usIds }, countryId: "US" },
            { projection: { _id: 1, countryId: 1, regionalProgramSettlements: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
  ]);
  const accountById = new Map(accounts.map((account) => [account._id, account]));
  const regionalById = new Map<
    string,
    { countryId: string; settlements: Readonly<Record<string, PovertyDelivery>> }
  >();
  for (const budget of regionalBudgets) {
    if (!budget.countryId) continue;
    regionalById.set(String(budget._id), {
      countryId: budget.countryId,
      settlements: budget.programSettlements ?? {},
    });
  }
  for (const budget of stateBudgets) {
    if (!budget.countryId) continue;
    regionalById.set(String(budget._id), {
      countryId: budget.countryId,
      settlements: budget.regionalProgramSettlements ?? {},
    });
  }
  const nationalByCountry = new Map<string, number>();
  const regionalByRegion = new Map<string, number>();
  const openingPrograms = openingPovertyPrograms({
    worldId,
    boards: openingBoards,
    replacements: programs,
    accounts,
  });
  const activePrograms: PovertyProgram[] = [...programs, ...openingPrograms];
  for (const program of activePrograms) {
    let paid: PovertyDelivery | undefined;
    if (program.scope === "national") {
      const account = accountById.get(program.fundingAccountId);
      const family = account?.lastProgramDelivery?.[program.familyId];
      if (account?.countryId === program.country && family) {
        paid = {
          implementationFactor: family.implementationFactor,
          lastSettledTurn: account.accruedThroughTurn,
        };
      }
    } else if (program.regionId) {
      const budget = regionalById.get(program.regionId);
      if (budget?.countryId === program.country) {
        paid = program.settlementLawId
          ? Object.values(budget.settlements).find(
              (settlement) => settlement.legislationTypeId === program.settlementLawId
            )
          : budget.settlements[program._id];
      }
    }
    const pressure = povertyDeliveredPressure(
      [program],
      new Map(paid ? [[program._id, paid]] : []),
      turn
    );
    const totals = program.scope === "national" ? nationalByCountry : regionalByRegion;
    const key = program.scope === "national" ? program.country : program.regionId;
    if (key) totals.set(key, (totals.get(key) ?? 0) + pressure);
  }
  return new Map(
    regions.map((region) => [
      region._id,
      {
        deliveredPressure:
          (nationalByCountry.get(region.countryId) ?? 0) + (regionalByRegion.get(region._id) ?? 0),
      },
    ])
  );
}
