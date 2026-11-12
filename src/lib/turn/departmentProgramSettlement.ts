import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { GameState, LegislationType } from "@/lib/db/types";
import { calculateFederalLawAnnualCosts } from "@/lib/budget/spending";
import { applyCountryDepartmentSettlements } from "@/lib/db/collections/departmentAccounts";
import { buildCountryDepartmentSettlementPlan } from "@/lib/governmentFinance/generalizedSettlementPlan";
import { withLawAdministration } from "@/lib/governmentFinance/lawAdministrationCatalog";
import type { DepartmentCountryId } from "@/lib/governmentFinance/departmentCatalog";
import { RESET_V2_COUNTRIES } from "@/lib/resetVersions/rules";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry, type ResetVersionState } from "@/lib/resetVersions/rules";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";

const MAX_COMMIT_ATTEMPTS = 3;

export interface DepartmentProgramTurnResult {
  enabled: boolean;
  programsSettled: number;
  authorityAccrued: number;
  outlaid: number;
  encumbered: number;
  implementationFactor: number | null;
  reconciliation: "not_run" | "balanced";
  countriesProcessed?: number;
  departmentsSettled?: number;
  skippedPrograms?: number;
}

function emptyResult(enabled: boolean): DepartmentProgramTurnResult {
  return {
    enabled,
    programsSettled: 0,
    authorityAccrued: 0,
    outlaid: 0,
    encumbered: 0,
    implementationFactor: null,
    reconciliation: "not_run",
  };
}

export async function processDepartmentProgramSettlement(
  db: Db,
  turn: number,
  gameState: Pick<GameState, "manuallyEnabledSeats"> & ResetVersionState
): Promise<DepartmentProgramTurnResult> {
  return processGeneralizedDepartmentSettlement(db, turn, gameState);
}

const GENERALIZED_COUNTRIES: DepartmentCountryId[] = [...RESET_V2_COUNTRIES];
const GENERALIZED_BUDGET_PROJECTION = {
  _id: 1,
  countryId: 1,
  gdp: 1,
  revenue: 1,
  spending: 1,
  baselineSpendingByCategory: 1,
  baselineStateGrants: 1,
  departmentAccounts: 1,
} as const;

async function loadGeneralizedBudgets(db: Db): Promise<FederalBudget[]> {
  return (await getFederalBudgetCollection(db))
    .find(
      { countryId: { $in: GENERALIZED_COUNTRIES } },
      { projection: GENERALIZED_BUDGET_PROJECTION }
    )
    .toArray();
}

async function loadGeneralizedBudget(
  db: Db,
  countryId: DepartmentCountryId
): Promise<FederalBudget | null> {
  return (await getFederalBudgetCollection(db)).findOne(
    { countryId },
    { projection: GENERALIZED_BUDGET_PROJECTION }
  );
}

async function processGeneralizedDepartmentSettlement(
  db: Db,
  turn: number,
  gameState: Pick<GameState, "manuallyEnabledSeats"> & ResetVersionState
): Promise<DepartmentProgramTurnResult> {
  const budgets = (await loadGeneralizedBudgets(db)).filter(
    (budget) =>
      resetSystemVersionsForCountry(gameState, RESET_V2_READY, String(budget.countryId)).cabinet !==
      "v2"
  );
  if (budgets.length === 0) return emptyResult(true);
  const costResults = await Promise.all(
    budgets.map(async (budget) => ({
      budget,
      costs: await calculateFederalLawAnnualCosts(db, budget),
    }))
  );
  const legislationTypeIds = [
    ...new Set(
      costResults.flatMap(({ costs }) => costs.activeLaws.map((law) => law.legislationTypeId))
    ),
  ];
  const storedTypes =
    legislationTypeIds.length === 0
      ? []
      : await legislationTypesCollection(db)
          .find(
            { _id: { $in: legislationTypeIds } },
            {
              projection: {
                _id: 1,
                countryScope: 1,
                policyDomain: 1,
                subCategory: 1,
                allowedScope: 1,
                nationalOnly: 1,
                budgetCategory: 1,
                isGrant: 1,
                effectTarget: 1,
                effectTargets: 1,
                effectTargetsWeighted: 1,
                administration: 1,
                policyOptions: 1,
              },
            }
          )
          .toArray();
  const types = withLawAdministration(storedTypes);
  const enabledSeats = new Set(gameState.manuallyEnabledSeats ?? []);
  let countriesProcessed = 0;
  let departmentsSettled = 0;
  let programsSettled = 0;
  let authorityAccrued = 0;
  let outlaid = 0;
  let encumbered = 0;
  let skippedPrograms = 0;

  for (const { budget: initialBudget, costs } of costResults) {
    const countryId = initialBudget.countryId as DepartmentCountryId;
    if (!GENERALIZED_COUNTRIES.includes(countryId)) continue;
    let budget = initialBudget;
    let finalPlan: ReturnType<typeof buildCountryDepartmentSettlementPlan> | null = null;
    let currentTurnSettlements:
      ReturnType<typeof buildCountryDepartmentSettlementPlan>["settlements"] | null = null;
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const annualCostByLawId = new Map(
        costs.items.map(({ law, amount }) => [law._id.toString(), amount])
      );
      const plan = buildCountryDepartmentSettlementPlan({
        countryId,
        turn,
        year: costs.eraYear,
        enabledSeats,
        accounts: budget.departmentAccounts ?? {},
        // Zero-cost options can still require administrative capacity and
        // produce delivered outcomes. Keep every active law in the plan while
        // leaving the sovereign spending calculation's zero-cost filtering
        // unchanged.
        activeLawCosts: costs.activeLaws.map((law) => ({
          law,
          amount: annualCostByLawId.get(law._id.toString()) ?? 0,
        })),
        legislationTypes: types,
      });
      finalPlan = plan;
      const pending = plan.settlements.filter((settlement) => !settlement.replayed);
      if (pending.length === 0) {
        currentTurnSettlements = [];
        break;
      }
      const committed = await applyCountryDepartmentSettlements(
        db,
        countryId,
        plan.openings,
        new Set(plan.createdDepartmentIds),
        pending
      );
      if (committed) {
        currentTurnSettlements = pending;
        break;
      }
      const reloaded = await loadGeneralizedBudget(db, countryId);
      if (!reloaded) break;
      budget = reloaded;
    }
    if (!finalPlan || currentTurnSettlements === null) {
      throw new Error(
        `department settlement could not commit after concurrent budget changes for ${countryId}`
      );
    }
    skippedPrograms += finalPlan.skippedPrograms.length;
    if (currentTurnSettlements.length === 0) continue;
    countriesProcessed += 1;
    departmentsSettled += currentTurnSettlements.length;
    programsSettled += currentTurnSettlements.reduce(
      (sum, settlement) => sum + settlement.programs.length,
      0
    );
    authorityAccrued += currentTurnSettlements.reduce(
      (sum, settlement) => sum + settlement.authorityAccrued,
      0
    );
    outlaid += currentTurnSettlements.reduce((sum, settlement) => sum + settlement.totalOutlays, 0);
    encumbered += currentTurnSettlements.reduce(
      (sum, settlement) => sum + settlement.closingEncumbered,
      0
    );
  }

  return {
    enabled: true,
    programsSettled,
    authorityAccrued,
    outlaid,
    encumbered,
    implementationFactor: null,
    reconciliation: departmentsSettled > 0 ? "balanced" : "not_run",
    countriesProcessed,
    departmentsSettled,
    skippedPrograms,
  };
}
