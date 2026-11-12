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
  const world = await db.collection<GameState>("gameState").findOne(
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
  const enabled =
    world?.preset === "2027-default" &&
    resetSystemVersionsForCountry(world, RESET_V2_READY, "US").legislation === "v2";
  const [boards, programs, types] = enabled
    ? await Promise.all([
        db
          .collection<ResetRegionalOpeningBoard>("resetRegionalOpeningBoards")
          .find({ countryId: "US", worldId: world!.resetWorldId })
          .toArray(),
        db
          .collection<ResetLawProgramDocument>("resetLawPrograms")
          .find({ country: "US", scope: "regional", worldId: world!.resetWorldId })
          .toArray(),
        db
          .collection<LegislationType>("legislationTypes")
          .find(
            { $or: [{ countryScope: "us" }, { countryScope: { $exists: false } }] },
            { projection: { _id: 1, name: 1, administration: 1, policyOptions: 1 } }
          )
          .toArray(),
      ])
    : [[], [], []];
  for (const board of boards) regionalOpeningServiceClaims(board);
  return {
    enabled,
    boards: new Map(boards.map((b) => [b.regionId, b])),
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
  if (!context.enabled || budget.countryId !== "US")
    return detail.spending.total > 0
      ? detail.spending
      : {
          ...budget.spending,
          total:
            Object.values(budget.spending.byCategory).reduce((sum, n) => sum + n, 0) +
            (budget.spending.resourceProspecting ?? 0),
        };
  const board = context.boards.get(budget.stateId);
  if (!board) throw new Error(`Missing US opening service baseline for ${budget.stateId}`);
  const previous = new Set(Object.keys(budget.regionalProgramSettlements ?? {}));
  return resolveRegionalSpending({
    baseSpending: detail.spending,
    services: regionalOpeningServiceClaims(board),
    laws: regionalLawClaims(detail.lawCosts, context.types, previous),
    programs: buildResetRegionalProgramClaims({
      programs: context.programs.filter((p) => p.regionId === budget.stateId),
      previousProgramIds: previous,
    }),
    revenue: budget.revenue.total,
    cash: budget.balance ?? 0,
    settle: true,
  }).spending;
}
