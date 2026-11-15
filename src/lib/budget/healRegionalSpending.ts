import { caProvincialServiceClaims } from "@/lib/countries/ca/rules/provincialServices";
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import type { StateBudget } from "@/lib/db/types/budget";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetRegionalOpeningBoard } from "@/lib/resetFinance/rules/regionalOpeningBoard";
import { regionalOpeningServiceClaims } from "@/lib/resetFinance/rules/regionalServiceClaims";
import { buildResetRegionalProgramClaims } from "@/lib/resetLegislation/rules/regionalClaims";
import { withLawAdministration } from "@/lib/governmentFinance/lawAdministrationCatalog";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { calculateStateSpendingDetail } from "./spending";
import { resolveRegionalSpending } from "./rules/regionalSpending";
import { regionalLawClaims } from "./rules/regionalLawClaims";

export async function loadRegionalHealContext(db: Db) {
  const world = await gameStateCollection<GameState>(db).findOne(
    { _id: "current" },
    {
      projection: {
        preset: 1,
        resetWorldId: 1,
        metricsSystemVersion: 1,
        legislationSystemVersion: 1,
        resetVersionSeeds: 1,
      },
    }
  );
  const enabledCountries =
    world?.preset === "2027-default"
      ? (["US", "CA"] as const).filter(
          (country) =>
            resetSystemVersionsForCountry(world, RESET_V2_READY, country).legislation === "v2"
        )
      : [];
  const enabled = enabledCountries.length > 0;
  const [boards, programs, types] = await Promise.all([
    enabled
      ? resetRegionalOpeningBoardsCollection<ResetRegionalOpeningBoard>(db)
          .find({ countryId: { $in: enabledCountries }, worldId: world!.resetWorldId })
          .toArray()
      : [],
    enabled
      ? resetLawProgramsCollection<ResetLawProgramDocument>(db)
          .find({
            country: { $in: enabledCountries },
            scope: "regional",
            worldId: world!.resetWorldId,
          })
          .toArray()
      : [],
    enabled || world?.preset === "2027-default"
      ? legislationTypesCollection<LegislationType>(db)
          .find(
            {
              $or: [{ countryScope: { $in: ["us", "ca"] } }, { countryScope: { $exists: false } }],
            },
            { projection: { _id: 1, name: 1, administration: 1, policyOptions: 1 } }
          )
          .toArray()
      : [],
  ]);
  for (const board of boards) regionalOpeningServiceClaims(board);
  return {
    preset: world?.preset,
    enabled,
    enabledCountries,
    boards: new Map(boards.map((b) => [`${b.countryId}:${b.regionId}`, b])),
    programs,
    types: new Map(withLawAdministration(types).map((t) => [t._id, t])),
  };
}

/** A preview/recalculation only: the healer does not advance cash or funding cadence. */
export async function regionalSpendingForHeal(
  db: Db,
  budget: StateBudget,
  context: Awaited<ReturnType<typeof loadRegionalHealContext>>
) {
  const countryId = budget.countryId;
  if (!countryId) throw new Error("Regional budget has no owning country");
  const detail = await calculateStateSpendingDetail(db, budget.stateId, countryId, budget);
  const usesV2 = (context.enabledCountries as readonly string[]).includes(countryId);
  const services = usesV2
    ? []
    : caProvincialServiceClaims(countryId, context.preset, budget.stateId);
  if (usesV2) {
    const board = context.boards.get(`${countryId}:${budget.stateId}`);
    if (!board)
      throw new Error(`Missing ${countryId} opening service baseline for ${budget.stateId}`);
    services.push(...regionalOpeningServiceClaims(board));
  }
  if (!services.length)
    return detail.spending.total > 0
      ? detail.spending
      : {
          ...budget.spending,
          total:
            Object.values(budget.spending.byCategory).reduce((sum, n) => sum + n, 0) +
            (budget.spending.resourceProspecting ?? 0),
        };
  const previous = new Set(Object.keys(budget.regionalProgramSettlements ?? {}));
  return resolveRegionalSpending({
    baseSpending: detail.spending,
    services,
    laws: regionalLawClaims(detail.lawCosts, context.types, previous),
    programs: buildResetRegionalProgramClaims({
      programs: context.programs.filter(
        (p) => p.country === countryId && p.regionId === budget.stateId
      ),
      previousProgramIds: previous,
    }),
    revenue: budget.revenue.total,
    cash: budget.balance ?? 0,
    settle: true,
  }).spending;
}

import { gameStateCollection } from "@/lib/db/repositories/gameState";

import { resetRegionalOpeningBoardsCollection } from "@/lib/db/repositories/resetRegionalOpeningBoards";

import { resetLawProgramsCollection } from "@/lib/db/repositories/resetLawPrograms";

import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
