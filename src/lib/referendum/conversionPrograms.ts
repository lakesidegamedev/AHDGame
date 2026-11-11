/** Boundary changes preserve enacted regional law choices and each successor's funded national programs. */
import type { Db } from "mongodb";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import type { State } from "@/lib/db/types/state";
import { planConvertedLawPrograms } from "./rules/conversionPrograms";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { fundingSeatForLaw } from "@/lib/resetLegislation/fundingOwner";
import type { ResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import { releasePromotedRegionalClaims } from "./secede/rules/lawSuccession";
import { statesCollection } from "@/lib/db/repositories/states";

export async function convertLawPrograms(
  db: Db,
  input: { regionId: string; countryId: ResetCountry; scale?: number; independent?: boolean }
) {
  const { regionId, countryId, scale = 1, independent = false } = input;
  const nationalBoard = independent
    ? await db
        .collection<ResetLawOpeningBoard>("resetLawOpeningBoards")
        .findOne({ _id: `${countryId}:national` })
    : null;
  const programs = await db
    .collection<ResetLawProgramDocument>("resetLawPrograms")
    .find({
      country: "UK",
      ...(nationalBoard ? { worldId: nationalBoard.worldId } : {}),
      $or: [{ regionId }, ...(independent ? [{ scope: "national" as const }] : [])],
    })
    .toArray();
  if (!programs.length) return;
  const regions = await statesCollection(db)
    .find(independent ? { countryId } : { _id: regionId }, {
      projection: { _id: 1, population: 1, gdp: 1 },
    })
    .toArray();
  const rump = independent
    ? await statesCollection(db)
        .find({ countryId: "UK" }, { projection: { gdp: 1 } })
        .toArray()
    : [];
  const accounts = await db
    .collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts")
    .find({ countryId })
    .toArray();
  const nationalFamilies =
    independent && nationalBoard
      ? resetLawFamilies.filter((family) => family.availability.national.includes(countryId))
      : [];
  const promotedFamilies = new Set(
    programs
      .filter(
        (program) =>
          program.scope === "regional" &&
          nationalFamilies.some((family) => family.id === program.familyId)
      )
      .map((program) => program.familyId)
  );
  const changedAccounts = new Set<string>();
  for (const familyId of promotedFamilies) {
    if (accounts.some((account) => Object.hasOwn(account.familyAnnualDemand, familyId))) continue;
    const family = nationalFamilies.find((family) => family.id === familyId)!;
    const account = accounts.find(
      (account) => account.controllingSeatId === fundingSeatForLaw(family, countryId)
    );
    if (!account) throw new Error(`No national department for inherited law ${familyId}`);
    account.familyAnnualDemand[familyId] = 0;
    account.familyGrossAnnualDemand[familyId] ??= 0;
    account.familyGrantReservation[familyId] ??= 0;
    changedAccounts.add(account._id);
  }
  if (changedAccounts.size)
    await db.collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts").bulkWrite(
      accounts
        .filter((account) => changedAccounts.has(account._id))
        .map((account) => ({
          replaceOne: {
            filter: { _id: account._id },
            replacement: account,
          },
        }))
    );
  const { updates, removals, promotedRegionalIds } = planConvertedLawPrograms({
    programs,
    accounts,
    regions,
    rump,
    countryId,
    independent,
    scale,
    ...(nationalBoard
      ? {
          nationalReferences: nationalBoard.references,
          nationalFamilyIds: nationalFamilies.map((family) => family.id),
        }
      : {}),
  });
  if (updates.length)
    await db.collection<ResetLawProgramDocument>("resetLawPrograms").bulkWrite(updates);
  if (removals.length)
    await db
      .collection<ResetLawProgramDocument>("resetLawPrograms")
      .deleteMany({ _id: { $in: removals } });
  if (promotedRegionalIds.length) {
    const budgets = await db
      .collection<RegionalBudget>("regionalBudgets")
      .find({ countryId })
      .toArray();
    const released = budgets.map((budget) => ({
      updateOne: {
        filter: { _id: budget._id },
        update: {
          $set: releasePromotedRegionalClaims(
            budget,
            nationalBoard!.worldId,
            countryId,
            promotedRegionalIds
          ),
        },
      },
    }));
    if (released.length) await db.collection<RegionalBudget>("regionalBudgets").bulkWrite(released);
  }
}
