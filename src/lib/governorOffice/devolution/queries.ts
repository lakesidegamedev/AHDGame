/**
 * Independence and Reunification Desire previews load both governments' stances,
 * approval and inflation for every region in the sovereignty registry.
 * loadIndependenceDesireSnapshots supplies the turn engine and both office
 * dashboards with the same regional calculations.
 */
import type { Db } from "mongodb";
import type { StateMetrics } from "@/lib/db/types";
import { resolveGameYear } from "@/lib/era/era";
import type { DevolutionPolicy, GovernorOfficeState } from "@/lib/db/types/governorOfficeState";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import type { CountryId } from "@/lib/constants/countriesCore";
import {
  sovereigntyCountryIds,
  sovereigntyRegion,
  sovereigntyRegionIds,
} from "@/lib/referendum/rules/sovereigntyRegions";
import {
  BASE_APPROVAL,
  calculateStateApproval,
  computeNationalAveragesFromMetrics,
  loadElectorateGroups,
  weightingFor,
} from "@/lib/utils/governmentApproval";
import { loadPoliticalApprovalBases } from "@/lib/politicalLegislation/politicalApprovalProvider";
import { mergeRegionMetrics } from "@/lib/macroMetrics/merge";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import type { IndependenceDesireDriftPerRegion } from "@/lib/governorOffice/devolution/independenceDesireDrift";
import { computeIndependenceDesireDriftSnapshot } from "@/lib/governorOffice/devolution/independenceDesireDrift";
import { getNationalStateId } from "@/lib/policy/nationalStateId";
import { resolveWestminsterPolicy } from "@/lib/governorOffice/devolution/rules";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { governmentApprovalsCollection } from "@/lib/db/repositories/governmentApprovals";

// Pure surface (driver types + snapshot compute) lives in the domain layer;
// re-exported here so existing importers keep working.
export * from "@/lib/governorOffice/devolution/independenceDesireDrift";

const DEFAULT_POLICY: DevolutionPolicy = "pro";
/** Fallback when the national approval snapshot doesn't exist yet (turn 1). */
const DEFAULT_NATIONAL_APPROVAL = 50;
/** Fallback when independenceDesire hasn't been seeded for a region yet. */
const DEFAULT_INDEPENDENCE_DESIRE = 50;
/** Fallback when the national budget hasn't been written yet. 2% sits in the
 *  inflationDrift mid-band → 0 contribution. */
const DEFAULT_INFLATION_PERCENT = 2;

/**
 * Compute the next-turn drift snapshot for a single sovereignty region without
 * writing to the DB. Same inputs the per-turn engine would use, pulled fresh
 * from the live collections. Returns null when the state is not in the
 * sovereignty registry or its metric doc is missing.
 *
 * Used by the metric-detail API to surface the drift's net delta as a
 * tickRate on `governance.independenceDesire`, so the 48-turn forward
 * projection chart matches the office tab's "Net drift next turn" line.
 */
export async function computeIndependenceDesireDriftForRegion(
  db: Db,
  stateId: string
): Promise<{
  drivers: IndependenceDesireDriftPerRegion["drivers"];
  delta: number;
  next: number;
  previous: number;
} | null> {
  const region = sovereigntyRegion(stateId);
  if (!region) return null;
  return (
    (await loadIndependenceDesireSnapshots(db, region.countryId)).find(
      (row) => row.stateId === region.regionId
    ) ?? null
  );
}

/**
 * Read every sovereignty region's preview, shared by the engine and dashboards.
 * A country with no seeded states costs nothing beyond the first states read,
 * so a world without Canada pays the same round trips as before.
 */
export async function loadIndependenceDesireSnapshots(
  db: Db,
  onlyCountryId?: CountryId
): Promise<IndependenceDesireDriftPerRegion[]> {
  const countries = onlyCountryId ? [onlyCountryId] : sovereigntyCountryIds();
  // stateMetrics documents are not consistently tagged with countryId on UK
  // seeds, so resolve state ids through the `states` collection.
  const stateRows = await statesCollection(db)
    .find({ countryId: { $in: countries } }, { projection: { _id: 1, countryId: 1 } })
    .toArray();
  const seeded = countries.filter((countryId) =>
    stateRows.some((row) => row.countryId === countryId)
  );
  if (seeded.length === 0) return [];

  const gameStateDoc = await gameStateCollection(db).findOne({ _id: "current" });
  const preset = gameStateDoc?.preset ?? DEFAULT_SEED_PRESET;
  // Live year for era-aware scoring; null while the flag is off (legacy path).
  const year = gameStateDoc ? resolveGameYear(gameStateDoc) : null;

  const perRegion: IndependenceDesireDriftPerRegion[] = [];
  for (const countryId of seeded) {
    const stateIds = stateRows.filter((row) => row.countryId === countryId).map((row) => row._id);
    perRegion.push(...(await loadCountrySnapshots(db, countryId, stateIds, preset, year)));
  }
  return perRegion;
}

async function loadCountrySnapshots(
  db: Db,
  countryId: CountryId,
  stateIds: string[],
  preset: string,
  year: number | null
): Promise<IndependenceDesireDriftPerRegion[]> {
  const regionIds = sovereigntyRegionIds(countryId);
  // SP5: regions live on macroMetrics; merge back to the legacy doc shape.
  const macroDocs = await macroMetricsCollection<MacroMetricsDoc>(db)
    .find({ _id: { $in: stateIds } })
    .toArray();
  const metrics = macroDocs
    .map((doc) => mergeRegionMetrics(doc))
    .filter((m): m is StateMetrics => m !== null);
  if (metrics.length === 0) return [];

  const nationalAverages = computeNationalAveragesFromMetrics(metrics);
  const nationalStateId = getNationalStateId(countryId);

  // National approval from the last snapshot. One-turn lag is acceptable for a
  // slowly changing constitutional preference.
  const [approvalDoc, budget, officeStates, groupsByState, bases] = await Promise.all([
    governmentApprovalsCollection(db).findOne({ _id: countryId }),
    federalBudgetCollection(db).findOne({ _id: getNationalBudgetId(countryId) }),
    // Regional and national policies together, without another round trip.
    db
      .collection<GovernorOfficeState>("governorOfficeState")
      .find({ countryId, stateId: { $in: [...regionIds, nationalStateId] } })
      .project<Pick<GovernorOfficeState, "stateId" | "devolutionPolicy" | "westminsterStances">>({
        _id: 0,
        stateId: 1,
        devolutionPolicy: 1,
        westminsterStances: 1,
      })
      .toArray(),
    // P6d: electorate-weighted regional approval (same value the snapshot stores).
    loadElectorateGroups(db, { countryId }),
    // SP4: hybrid political bases once for the whole country.
    loadPoliticalApprovalBases(db, countryId),
  ]);
  const nationalApproval = approvalDoc?.approvalRating ?? DEFAULT_NATIONAL_APPROVAL;
  const inflationPercent = budget?.economicFactors?.inflationRate ?? DEFAULT_INFLATION_PERCENT;
  const policyByState = new Map<string, DevolutionPolicy>(
    officeStates
      .filter((o) => o.devolutionPolicy != null)
      .map((o) => [o.stateId, o.devolutionPolicy as DevolutionPolicy])
  );
  const nationalOffice = officeStates.find((o) => o.stateId === nationalStateId);

  const perRegion: IndependenceDesireDriftPerRegion[] = [];
  for (const stateId of regionIds) {
    const metric = metrics.find((m) => m._id === stateId);
    if (!metric) continue;

    const previous = metric.governance?.independenceDesire?.value ?? DEFAULT_INDEPENDENCE_DESIRE;
    const policy = policyByState.get(stateId) ?? DEFAULT_POLICY;
    const westminsterPolicy = resolveWestminsterPolicy(
      nationalOffice?.westminsterStances?.[stateId]?.policy
    );
    const regionalApproval = calculateStateApproval(
      metric,
      nationalAverages,
      [],
      weightingFor(groupsByState, countryId, stateId),
      preset,
      year,
      bases?.byRegion.get(stateId) ?? BASE_APPROVAL,
      bases?.modifiersByRegion?.get(stateId)
    );

    const { drivers, delta, next } = computeIndependenceDesireDriftSnapshot({
      previous,
      policy,
      westminsterPolicy,
      regionalApproval,
      nationalApproval,
      inflationPercent,
    });

    perRegion.push({
      stateId,
      policy,
      westminsterPolicy,
      trend: metric.governance?.independenceDesire?.trend ?? 0,
      previous,
      next,
      delta,
      drivers,
      inputs: { regionalApproval, nationalApproval, inflationPercent },
    });
  }
  return perRegion;
}
