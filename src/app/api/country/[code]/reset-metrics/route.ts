import { metricDisplayUnit } from "@/lib/resetMetrics/presentation";
import { metricPolicyPressure } from "@/lib/resetMetrics/rules/policyPressure";
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { primaryMetrics } from "@/lib/resetMetrics/catalog";
import { readResetMetricBoard } from "@/lib/resetMetrics/readBoard";
import { readNationalMetricRollup } from "@/lib/resetMetrics/readNationalRollup";
import type { ResetCabinetActionState } from "@/lib/resetCabinet/rules/actionState";
import {
  combineActiveActionEffects,
  mergeApplicableActionEffects,
} from "@/lib/resetCabinet/rules/actions";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import type { StateBudget } from "@/lib/db/types/budget";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { getSharedFiscalYearStartTurnInYear } from "@/lib/countrySystems/fiscalCalendar";
import { resetMetricConditionScore } from "@/lib/resetMetrics/conditionScore";
import { readResetGovernanceStyle } from "@/lib/resetMetrics/readGovernanceStyle";
import { resetLawFamilies, resetLawFamilyById } from "@/lib/resetLegislation/catalog";
import { withPostLaunchReferences } from "@/lib/resetLegislation/rules/postLaunchReferences";
import { openingLawTitle } from "@/lib/resetLegislation/rules/openingLawTitle";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { resetCabinetActions } from "@/lib/resetCabinet/catalog";
import type { ResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import {
  buildMetricLawStatuses,
  nextAnnualFundingTurn,
} from "@/lib/resetLegislation/rules/metricPolicyStatus";
import { isResetV2Country } from "@/lib/resetVersions/rules";
import { cabinetActionApplies } from "@/lib/resetMetrics/loadPolicyPressure";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import { loadMetricLawDelivery } from "@/lib/resetMetrics/loadLawDelivery";
import {
  deliveredLawFactor,
  metricLawApplies,
  netMetricLawPressureByFamily,
} from "@/lib/resetMetrics/rules/lawDelivery";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { resetLawProgramsCollection } from "@/lib/db/repositories/resetLawPrograms";
import { resetDepartmentAccountsCollection } from "@/lib/db/repositories/resetDepartmentAccounts";
import { resetLawOpeningBoardsCollection } from "@/lib/db/repositories/resetLawOpeningBoards";
import { resetCabinetActionStatesCollection } from "@/lib/db/repositories/resetCabinetActionStates";

const cabinetActionTitles = new Map(resetCabinetActions.map((action) => [action.id, action.title]));

/** V2 primary board. V1 countries keep their existing metrics API unchanged. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase();
    if (!isResetV2Country(countryId)) {
      return errorResponse(404, "V2 metrics are not available for this country");
    }
    const regionId = new URL(request.url).searchParams.get("region") ?? undefined;
    const db = await getDb();
    const board = await readResetMetricBoard(db, countryId, regionId);
    if (board.status === "not_enabled") {
      return errorResponse(409, "V2 metrics are not enabled");
    }
    if (board.status !== "ready") {
      return errorResponse(503, "V2 metrics board is unavailable", {
        extra: { reason: board.status },
        headers: { "Cache-Control": "no-store" },
      });
    }
    const [
      observations,
      actionState,
      programs,
      departmentAccounts,
      regionalBudget,
      openingLawBoard,
    ] = await Promise.all([
      board.board.scope === "national"
        ? readNationalMetricRollup(db, board.board)
        : Promise.resolve(board.board.observations),
      resetCabinetActionStatesCollection<ResetCabinetActionState>(db).findOne(
        { _id: countryId as ResetCountry, worldId: board.board.worldId },
        { projection: { active: 1 } }
      ),
      resetLawProgramsCollection<ResetLawProgramDocument>(db)
        .find(
          {
            worldId: board.board.worldId,
            country: countryId,
            scope: board.board.scope,
            effectiveTurn: { $lte: board.board.asOfTurn },
            ...(board.board.regionId ? { regionId: board.board.regionId } : {}),
          },
          {
            projection: {
              familyId: 1,
              choice: 1,
              titleSnapshot: 1,
              primaryMetricEffects: 1,
              fundingAccountId: 1,
              effectiveTurn: 1,
              annualAgencyAllocation: 1,
              country: 1,
              scope: 1,
              regionId: 1,
            },
          }
        )
        .toArray(),
      board.board.scope === "national"
        ? resetDepartmentAccountsCollection<ResetDepartmentAccountSnapshot>(db)
            .find(
              { worldId: board.board.worldId, countryId },
              {
                projection: { lastProgramDelivery: 1, externallySettled: 1, accruedThroughTurn: 1 },
              }
            )
            .toArray()
        : Promise.resolve([]),
      board.board.scope === "regional" && board.board.regionId
        ? countryId === COUNTRY_CONFIGS.US.id
          ? stateBudgetsCollection(db).findOne(
              { _id: board.board.regionId, countryId: COUNTRY_CONFIGS.US.id },
              { projection: { regionalProgramSettlements: 1 } }
            )
          : regionalBudgetsCollection(db).findOne(
              { _id: board.board.regionId, countryId },
              { projection: { programSettlements: 1 } }
            )
        : Promise.resolve(null),
      resetLawOpeningBoardsCollection<ResetLawOpeningBoard>(db).findOne(
        {
          _id: `${countryId}:${board.board.regionId ?? "national"}`,
          worldId: board.board.worldId,
        },
        { projection: { references: 1 } }
      ),
    ]);
    if (!observations) {
      return errorResponse(503, "V2 national metric rollup is unavailable", {
        extra: { reason: "regional_rollup" },
        headers: { "Cache-Control": "no-store" },
      });
    }
    const temporaryEffects = new Map(
      mergeApplicableActionEffects(
        combineActiveActionEffects(actionState?.active ?? [], board.board.asOfTurn)
          .filter((effect) =>
            cabinetActionApplies(effect.scope, board.board.scope, board.board.regionId)
          )
          .filter((effect) => /^M\d{2}$/.test(effect.target))
      ).map((effect) => [effect.target.slice(1), effect])
    );
    const delivery =
      board.board.scope === "regional"
        ? programs.map((program) => {
            const settlements =
              countryId === COUNTRY_CONFIGS.US.id
                ? (regionalBudget as StateBudget | null)?.regionalProgramSettlements
                : (regionalBudget as RegionalBudget | null)?.programSettlements;
            return {
              familyId: program.familyId,
              implementationFactor: deliveredLawFactor(
                program,
                settlements?.[program._id],
                board.board.asOfTurn
              ),
              awaitingFirstFunding:
                !settlements?.[program._id] &&
                program.choice !== "leave_to_states" &&
                program.effectiveTurn <= board.board.asOfTurn,
            };
          })
        : programs.map((program) => {
            const account = departmentAccounts.find(
              (candidate) => candidate._id === program.fundingAccountId
            );
            return {
              familyId: program.familyId,
              implementationFactor: deliveredLawFactor(
                program,
                account
                  ? {
                      implementationFactor:
                        account.lastProgramDelivery?.[program.familyId]?.implementationFactor ??
                        (account.externallySettled ? 1 : 0),
                      lastSettledTurn: account.accruedThroughTurn,
                    }
                  : undefined,
                board.board.asOfTurn
              ),
            };
          });
    const laws = await loadMetricLawDelivery(db, {
      worldId: board.board.worldId,
      turn: board.board.asOfTurn,
      countryIds: [countryId],
      regions: board.board.regionId ? [{ _id: board.board.regionId, countryId }] : [],
    });
    const pressure = metricPolicyPressure({
      board: board.board,
      ...laws,
      turn: board.board.asOfTurn,
      temporary: [...temporaryEffects].map(([id, effect]) => ({
        target: `M${id}`,
        favorableNormalizedPoints: effect.favorableNormalizedPoints,
      })),
    });
    const netByFamily = netMetricLawPressureByFamily(
      laws.programs.filter((p) => metricLawApplies(p, board.board)),
      laws.opening.filter((p) => metricLawApplies(p, board.board)),
      laws.settlements,
      board.board.asOfTurn
    );
    const openingReferences = openingLawBoard ? withPostLaunchReferences(openingLawBoard) : {};
    const componentIds = [
      ...new Set(
        Object.values(openingReferences).flatMap((reference) =>
          reference.sourceComponents.map((component) => component.sourceId)
        )
      ),
    ];
    const lawTypes = componentIds.length
      ? await legislationTypesCollection(db)
          .find({ _id: { $in: componentIds } }, { projection: { name: 1, policyOptions: 1 } })
          .toArray()
      : [];
    const lawTypeById = new Map(lawTypes.map((type) => [String(type._id), type]));
    const readableReferences = Object.fromEntries(
      Object.entries(openingReferences).map(([familyId, reference]) => [
        familyId,
        {
          ...reference,
          currentLaw: openingLawTitle(reference, (sourceId, optionIndex) => {
            const type = lawTypeById.get(sourceId);
            const level = type?.policyOptions?.[optionIndex]?.name;
            return type?.name && level ? { lawName: type.name, levelName: level } : null;
          }),
        },
      ])
    );
    const standingLaws = openingLawBoard
      ? buildMetricLawStatuses({
          country: countryId,
          scope: board.board.scope,
          families: resetLawFamilies,
          references: readableReferences,
          programs,
          delivery,
          netByFamily,
          nextFundingTurn: nextAnnualFundingTurn(
            board.board.asOfTurn,
            getSharedFiscalYearStartTurnInYear()
          ),
        })
      : {};
    const metrics = primaryMetrics
      .filter((metric) => board.board.scope === "national" || metric.aggregation !== "national")
      .map((definition) => {
        const temporary = temporaryEffects.get(definition.id);
        const policyPressure = pressure[definition.id];
        const observation = observations[definition.id];
        return {
          ...definition,
          unit: metricDisplayUnit(observation?.unit ?? definition.unit),
          observation,
          conditionScore:
            observation?.definitionVersion === 2 && ["02", "24"].includes(definition.id)
              ? null
              : resetMetricConditionScore(
                  definition,
                  observation?.value ?? null,
                  countryId,
                  board.year
                ),
          temporaryActionEffect: temporary
            ? {
                favorableNormalizedPoints: temporary.favorableNormalizedPoints,
                contributingActions: temporary.contributingActions.map(
                  (actionId) => cabinetActionTitles.get(actionId) ?? "Cabinet initiative"
                ),
              }
            : null,
          policyPressure: policyPressure ?? null,
          legislativeEffect:
            policyPressure && Math.abs(policyPressure.netLaw) >= 0.00005
              ? {
                  favorableNormalizedPoints: policyPressure.netLaw,
                  contributingPrograms: Object.entries(netByFamily)
                    .filter(([, metrics]) => metrics[definition.id] !== undefined)
                    .map(
                      ([familyId]) => resetLawFamilyById(familyId)?.title ?? "Legislative program"
                    ),
                }
              : null,
          standingLaws: standingLaws[definition.id] ?? [],
        };
      });
    const governanceStyle = await readResetGovernanceStyle({
      db,
      worldId: board.board.worldId,
      countryId,
      scope: board.board.scope,
      regionId: board.board.regionId,
      conditionScores: Object.fromEntries(
        metrics.map((metric) => [metric.id, metric.conditionScore])
      ),
      programs,
    });
    return NextResponse.json(
      {
        version: "v2",
        countryId,
        scope: board.board.scope,
        regionId: board.board.regionId ?? null,
        asOfTurn: board.board.asOfTurn,
        governanceStyle,
        metrics,
      },
      { headers: { "Cache-Control": "no-store, no-transform" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
