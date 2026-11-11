import { getDb } from "@/lib/mongodb";
import type { FederalBudget, StateBudget, EconomicGrowthFactors } from "@/lib/db/types/budget";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import type { CountryId } from "@/lib/constants/countries";
import { getNationalDocId, NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { getRegisteredCountryIdSet } from "@/lib/country/registeredCountries";
import { resolvePipelineGdpGrowth } from "@/lib/country/nationalGdpGrowth";
import { logWarning } from "@/lib/utils/errorLog";
import {
  applyPerTurnGrowthToFederalBases,
  applyPerTurnGrowthToStateBases,
  calculateFederalRevenue,
  computeTaxBaseGdpShareBaseline,
  normalizeFederalTaxRates,
  sanitizeStateTaxBases,
  type TaxBaseGravityContext,
} from "@/lib/budget/revenue";
import { federalSurplus } from "@/lib/budget/federalSurplus";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import { labourWageParams } from "@/lib/turn/corporation/producerStageEnv";
import {
  WAGE_SHARE_DEFAULT_SURPLUS_CAP,
  WAGE_SHARE_DEFAULT_TARGET,
  labourWageGrowth,
  receiptValueAdded,
  type LabourWageParams,
  type LabourWagePlant,
  type WageShareReceipt,
} from "@/lib/market/producerMarket/wageShareRules";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getStatesCollection } from "@/lib/db/collections/states";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

/* Applies 1/TURNS_PER_YEAR of the annual wage/trade/gdp rates to tax bases
 * each turn, so bases and accrued revenue track the live economy instead of
 * jumping yearly. fiscalYear keeps annual work but no longer grows bases.
 * Runs after computeNationalMetrics and before tradeGrowthMirror. Federal
 * bases use national rates; state bases use that state's own rates. */
function resolveBudgetCountryId(budget: Pick<FederalBudget, "_id" | "countryId">): CountryId {
  return (budget.countryId ||
    (String(budget._id) === "federal" ? "US" : String(budget._id))) as CountryId;
}

function metricRate(
  metrics: StateMetrics | undefined,
  key: "wageGrowth" | "tradeGrowth" | "gdpGrowth",
  fallback: number
): number {
  const v = metrics?.economic?.[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

type LabourWageGameConfig = Pick<
  GameConfig,
  | "producerLabourWageStage"
  | "producerLabourWageNaturalRate"
  | "producerLabourWageSlackRate"
  | "producerLabourWageMaxShare"
  | "producerLabourWageFloorShare"
  | "producerLabourWageStep"
  | "producerWageShareTarget"
  | "producerWageShareSurplusCap"
>;

const LABOUR_WAGE_CONFIG_PROJECTION = {
  producerLabourWageStage: 1,
  producerLabourWageNaturalRate: 1,
  producerLabourWageSlackRate: 1,
  producerLabourWageMaxShare: 1,
  producerLabourWageFloorShare: 1,
  producerLabourWageStep: 1,
  producerWageShareTarget: 1,
  producerWageShareSurplusCap: 1,
} as const;

type LabourWageSector = {
  stateId?: string;
  producerSettlement?: WageShareReceipt;
};

/** This turn's funded plant receipts, reduced to what the labour wage move reads, by state. */
async function loadLabourWagePlantsByState(
  db: Awaited<ReturnType<typeof getDb>>,
  turn: number
): Promise<Map<string, LabourWagePlant[]>> {
  const sectors = await corporateSectorsCollection<LabourWageSector>(db)
    .find(
      { "producerSettlement.turn": turn },
      {
        projection: {
          _id: 0,
          stateId: 1,
          "producerSettlement.revenue": 1,
          "producerSettlement.inputsConsumed": 1,
          "producerSettlement.minorInputPremium": 1,
          "producerSettlement.inventoryWriteOff": 1,
          "producerSettlement.otherOperatingPaid": 1,
          "producerSettlement.otherOperatingArrears": 1,
          "producerSettlement.labourPaid": 1,
          "producerSettlement.labourArrears": 1,
        },
      }
    )
    .toArray();
  const out = new Map<string, LabourWagePlant[]>();
  for (const sector of sectors) {
    const r = sector.producerSettlement;
    if (!sector.stateId || !r) continue;
    const plant: LabourWagePlant = {
      labour: (r.labourPaid ?? 0) + (r.labourArrears ?? 0),
      valueAdded: receiptValueAdded(r),
      siteBill: (r.otherOperatingPaid ?? 0) + (r.otherOperatingArrears ?? 0),
    };
    const list = out.get(sector.stateId);
    if (list) list.push(plant);
    else out.set(sector.stateId, [plant]);
  }
  return out;
}

export async function processFiscalBaseGrowth(
  _turn: number
): Promise<{ countriesProcessed: number; statesProcessed: number }> {
  const db = await getDb();
  const [allFederalBudgets, stateBudgets, allStateMetrics, states, gameConfig] = await Promise.all([
    (await getFederalBudgetCollection(db)).find({}).toArray(),
    stateBudgetsCollection(db).find({}).toArray(),
    db.collection<StateMetrics>("macroMetrics").find({}).toArray(),
    (await getStatesCollection(db)).find({}).toArray(),
    db
      .collection<LabourWageGameConfig & { _id: string }>("gameConfig")
      .findOne({ _id: "default" }, { projection: LABOUR_WAGE_CONFIG_PROJECTION }),
  ]);
  // Labour stage: wage growth follows each country's labour market instead of
  // the national doc's rate (or the flat 3.0 where there is none).
  const labourWage: LabourWageParams | null = labourWageParams(gameConfig);
  const labourPlantsByState = labourWage
    ? await loadLabourWagePlantsByState(db, _turn)
    : new Map<string, LabourWagePlant[]>();

  // Dissolved countries keep their budget doc but must not be simulated against
  // it; see `getRegisteredCountryIdSet`.
  const liveCountries = await getRegisteredCountryIdSet(db);
  const federalBudgets = allFederalBudgets.filter((b) =>
    liveCountries.has(String(b.countryId ?? b._id))
  );

  const metricsById = new Map(allStateMetrics.map((m) => [String(m._id), m]));
  const stateBudgetById = new Map(stateBudgets.map((b) => [String(b._id), b]));

  let countriesProcessed = 0;
  let statesProcessed = 0;

  // Countries are independent (each touches only its own federal doc and its
  // own states' budget docs), so fan the recomputes out instead of walking
  // budgets serially.
  await Promise.all(
    federalBudgets.map(async (budget) => {
      const countryId = resolveBudgetCountryId(budget);
      // Same states this country's per-state base growth already filters below —
      // computed here first so the federal gravity pull (guardrail against the
      // wage/trade-vs-GDP structural drift, see taxBaseGdpShareBaseline) has a
      // live current-GDP figure rather than the smoothed `budget.gdp` basis.
      const countryStates = states.filter(
        (s) => s.countryId === countryId && !NATIONAL_SCOPE_IDS.has(String(s._id))
      );
      const currentGdp = countryStates.reduce((sum, s) => sum + (s.gdp || 0), 0) * 1_000_000;
      const nationalDocId = getNationalDocId(countryId);
      const national = nationalDocId ? metricsById.get(nationalDocId) : undefined;
      const engineWageGrowth = metricRate(national, "wageGrowth", 3.0);
      const wageGrowth =
        (labourWage &&
          labourWageGrowth({
            states: countryStates.map((s) => ({
              unemploymentRate: metricsById.get(String(s._id))?.economic?.unemploymentRate?.value,
              gdp: s.gdp ?? 0,
              plants: labourPlantsByState.get(String(s._id)) ?? [],
            })),
            params: labourWage,
            fallbackTarget: gameConfig?.producerWageShareTarget ?? WAGE_SHARE_DEFAULT_TARGET,
            surplusCap: gameConfig?.producerWageShareSurplusCap ?? WAGE_SHARE_DEFAULT_SURPLUS_CAP,
            previous: budget.economicFactors?.wageGrowth,
            turnsPerYear: TURNS_PER_YEAR,
          })) ??
        engineWageGrowth;
      const tradeGrowth = metricRate(national, "tradeGrowth", 2.0);
      // National doc first, then the GDP-weighted regional mean (the 17
      // countries with no national doc were growing their bases on a flat 2.5
      // while contracting), then 2.5. Same rule `fiscalYear` records annually.
      const gdpGrowth = resolvePipelineGdpGrowth({
        nationalDocGrowth: national?.economic?.gdpGrowth?.value,
        regions: countryStates.map((s) => ({
          growth: metricsById.get(String(s._id))?.economic?.gdpGrowth?.value,
          gdp: s.gdp ?? 0,
        })),
      });
      // `??` only substitutes null/undefined, so a NaN inflation reading passed
      // straight through here while its three siblings (wageGrowth, tradeGrowth,
      // gdpGrowth) were all finiteness-checked via metricRate above. That single
      // asymmetry was enough to NaN every tax base: this value is reused for every
      // state, lands in growFederalBases/growStateBases (which do not re-check),
      // and is persisted to federalBudget.taxBases and stateBudgets.taxBases —
      // from which revenue.total, treasuryBalance, debt.principal, debtToGdpRatio
      // and creditRating are all recomputed. Match the siblings.
      const rawInflation = budget.economicFactors?.inflationRate;
      const inflationRate =
        typeof rawInflation === "number" && Number.isFinite(rawInflation) ? rawInflation : 2.5;
      const factors: EconomicGrowthFactors = {
        gdpGrowth,
        wageGrowth,
        inflationRate,
        tradeGrowth,
        lastUpdated: new Date(),
      };

      // Always refresh the consumed factor fields (inflation.ts reads
      // economicFactors.wageGrowth; tradeGrowthMirror reads economicFactors.tradeGrowth),
      // and grow the federal bases by the per-turn slice when present.
      // gdpGrowth is mirrored too. It used to be written only by the annual
      // fiscal pass, so the budget page and the public nations API showed a
      // fiscal-year-end snapshot (+3.9 at turn 650) while every other surface
      // read the live national doc (-7.0). One number, refreshed every turn.
      const set: Record<string, unknown> = {
        "economicFactors.gdpGrowth": gdpGrowth,
        "economicFactors.wageGrowth": wageGrowth,
        "economicFactors.tradeGrowth": tradeGrowth,
        "economicFactors.lastUpdated": factors.lastUpdated,
      };
      if (budget.taxBases) {
        // Self-heal the gravity baseline once (mirrors eraGdpPerCapitaBaseline in
        // nationalMetrics.ts): first turn it's missing, snapshot each base's
        // CURRENT share of GDP as the target the pull-back will track toward.
        let shareBaseline = budget.taxBaseGdpShareBaseline;
        if (!shareBaseline || Object.keys(shareBaseline).length === 0) {
          shareBaseline = computeTaxBaseGdpShareBaseline(budget.taxBases, currentGdp);
          if (Object.keys(shareBaseline).length > 0) {
            set.taxBaseGdpShareBaseline = shareBaseline;
          }
        }
        const gravity: TaxBaseGravityContext | undefined =
          currentGdp > 0 && shareBaseline && Object.keys(shareBaseline).length > 0
            ? { currentGdp, shareBaseline }
            : undefined;
        set.taxBases = applyPerTurnGrowthToFederalBases(budget.taxBases, factors, gravity);
      }
      // Same one-time self-heal for the non-tax receipts line, so `other` tracks
      // the economy's size instead of the frozen absolute it was seeded with.
      // Snapshotting the CURRENT ratio means an untouched budget keeps exactly
      // the share it already has — the heal is a no-op in value terms, and only
      // future GDP moves change the amount (see FederalBudget field doc).
      if (budget.otherRevenueGdpShareBaseline == null) {
        const currentOther = budget.revenue?.other;
        // Divided by `budget.gdp`, NOT the live regional roll-up used for the tax
        // -base gravity above. `calculateFederalRevenue` multiplies this share by
        // `budget.gdp`, and the two figures differ (the smoothed basis runs
        // behind the live sum), so healing against the live figure would shift
        // `other` by that ratio on the very first turn instead of preserving it.
        // Same denominator in and out is what makes the heal value-neutral.
        const budgetGdp = budget.gdp;
        if (
          typeof budgetGdp === "number" &&
          Number.isFinite(budgetGdp) &&
          budgetGdp > 0 &&
          typeof currentOther === "number" &&
          Number.isFinite(currentOther) &&
          currentOther > 0
        ) {
          set.otherRevenueGdpShareBaseline = currentOther / budgetGdp;
        }
      }
      await federalBudgetCollection(db).updateOne({ _id: budget._id }, { $set: set });

      // Recompute federal revenue off the freshly grown bases (calculateFederalRevenue
      // reads the persisted taxBases) so the per-turn treasury accrual tracks growth.
      if (budget.taxBases) {
        const normalized = normalizeFederalTaxRates(budget.taxRates);
        if (normalized) {
          const revenue = await calculateFederalRevenue(db, normalized, String(budget._id));
          // `surplus` caches revenue.total - spending.total (see federalSurplus).
          // A revenue-only write leaves it stale by the grown amount each turn, which
          // the end-of-turn invariant check flags as drift. Persist both in the same write.
          const surplus = federalSurplus({ revenue, spending: budget.spending });
          await federalBudgetCollection(db).updateOne(
            { _id: budget._id },
            { $set: { revenue, surplus } }
          );
        }
      }
      countriesProcessed += 1;

      // Grow each state's bases by THAT state's own factors (the engine writes
      // per-state wageGrowth/tradeGrowth). State revenue reconciles annually in
      // fiscalYear off these grown bases — no per-turn state revenue recompute.
      // (countryStates computed above, alongside the federal currentGdp figure.)
      const stateOps: Array<{
        updateOne: {
          filter: { _id: string };
          update: { $set: { taxBases: StateBudget["taxBases"] } };
        };
      }> = [];
      for (const st of countryStates) {
        const sb = stateBudgetById.get(String(st._id));
        if (!sb?.taxBases) continue;
        const sm = metricsById.get(String(st._id));
        const stFactors: EconomicGrowthFactors = {
          gdpGrowth: metricRate(sm, "gdpGrowth", gdpGrowth),
          wageGrowth: metricRate(sm, "wageGrowth", wageGrowth),
          inflationRate,
          tradeGrowth: metricRate(sm, "tradeGrowth", tradeGrowth),
          lastUpdated: factors.lastUpdated,
        };
        // A NaN base is absorbing — every growth step multiplies it, so it
        // survives forever and spreads into revenue, balance and surplus. Repair
        // it from regional GDP before growing (see `sanitizeStateTaxBases`);
        // `state.gdp` is in millions, hence the scale-up.
        const { bases: cleanBases, repaired } = sanitizeStateTaxBases(
          sb.taxBases,
          (st.gdp ?? 0) * 1_000_000
        );
        if (repaired.length > 0) {
          logWarning("Repaired non-finite state tax bases from regional GDP (#1323)", {
            component: "FiscalBaseGrowth",
            action: "sanitize state tax bases",
            metadata: { stateId: String(sb._id), repaired },
          });
        }
        stateOps.push({
          updateOne: {
            filter: { _id: String(sb._id) },
            update: { $set: { taxBases: applyPerTurnGrowthToStateBases(cleanBases, stFactors) } },
          },
        });
        statesProcessed += 1;
      }
      if (stateOps.length > 0) {
        await stateBudgetsCollection(db).bulkWrite(stateOps);
      }
    })
  );

  return { countriesProcessed, statesProcessed };
}
