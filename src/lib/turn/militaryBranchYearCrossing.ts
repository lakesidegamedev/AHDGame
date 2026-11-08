import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { MILITARY_BRANCHES_BY_COUNTRY, isMilitaryEraActive } from "@/lib/constants/military";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { getMilitaryUnitsCollection } from "@/lib/db/collections/militaryUnits";
import { buildCountryRoster } from "@/lib/admin/seed/seedMilitaryUnits";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { createSystemNewsPost } from "@/lib/news";
import { getGameStateCollection } from "@/lib/db/collections/gameState";

export interface MilitaryBranchYearCrossingResult {
  ran: boolean;
  /** "DD:landstreitkraefte x6" */
  raised: string[];
  /** Titles of news posts made this run. */
  posted: string[];
  /** True when the guard was stamped on first run (standup silent, no news). */
  healed?: boolean;
}

/**
 * `buildCountryRoster` only uses `regionIds` as a non-empty guard — it never reads the
 * ids and no unit field derives from them. Mirrors `seedRosterUpkeep`'s stub so a
 * standup needs no extra states query.
 */
const ROSTER_REGION_STUB = ["standup"];

/**
 * Military branch year crossing: stand up a country's authored order of battle
 * when a service that did not exist at world start becomes era-active.
 *
 * `seedMilitaryUnits` runs once at bootstrap and skips countries whose branches
 * are all gated in the future (`getBranches` returns `[]`), so their authored
 * rosters are never seeded. This phase is the watcher that later raises them.
 *
 * Guarded by `gameState.lastMilitaryBranchYearProcessed`:
 *  - First run stands up every currently-active branch holding zero units,
 *    silently, without news, so already-past worlds self-heal.
 *  - Later runs act only on a genuine year advance, only for branches that
 *    crossed inactive -> active, posting news per service raised.
 *
 * Idempotent per branch: a branch that already holds units is never topped up,
 * so a crossing cannot refund divisions lost in a war. The one blind spot is the
 * first run, which cannot tell "never seeded" from "wiped out"; re-raising
 * beats leaving a country permanently unarmed.
 *
 * Dissolution is deliberately NOT handled here: a branch past its
 * `dissolvedYear` keeps its units rather than having them deleted.
 *
 * News copy carries no literal years (LARP convention).
 */
export async function runMilitaryBranchYearCrossing(
  db: Db,
  currentYearOverride?: number
): Promise<MilitaryBranchYearCrossingResult> {
  const result: MilitaryBranchYearCrossingResult = { ran: false, raised: [], posted: [] };

  const gameState = await (
    await getGameStateCollection(db)
  ).findOne(
    { _id: "current" },
    { projection: { currentYear: 1, lastMilitaryBranchYearProcessed: 1 } }
  );
  if (!gameState) return result;

  // Prefer the turn context's authoritative year: the persisted
  // gameState.currentYear is only stamped at turn end (#2059).
  const currentYear = currentYearOverride ?? gameState.currentYear;
  if (currentYear === undefined || !Number.isFinite(currentYear)) return result;

  const lastYear = gameState.lastMilitaryBranchYearProcessed;
  const firstRun = lastYear === undefined || !Number.isFinite(lastYear);
  if (!firstRun && currentYear <= lastYear) return result;

  const preset = await loadWorldPreset(db);
  const era = eraForPreset(preset);
  const units = getMilitaryUnitsCollection(db);

  // Which (country, branch) pairs already hold units, in one read rather than a count
  // per branch. A branch present here is never topped up.
  const populated = new Set(
    (await units.find({}, { projection: { countryId: 1, branchId: 1 } }).toArray()).map(
      (u) => `${u.countryId}:${u.branchId}`
    )
  );

  const postNews = !firstRun;
  const staged: MilitaryUnit[] = [];

  // Registered countries only: an era crossing that activates a branch must
  // not raise fresh units for a country dissolved by a merge — its army
  // already crossed to the survivor, and a ghost service founded afterwards
  // would be keyed to a state that no longer exists.
  const registered = new Set(await getRegisteredCountryIds(db));

  for (const countryId of Object.keys(COUNTRY_CONFIGS) as CountryId[]) {
    if (!registered.has(countryId)) continue;
    const branches = MILITARY_BRANCHES_BY_COUNTRY[countryId] ?? [];
    if (branches.length === 0) continue;

    // On first run "newly active" means "active now"; the zero-units check below is what
    // keeps that from re-seeding branches that were already stood up at bootstrap.
    const raisedBranches = branches.filter((branch) => {
      if (!isMilitaryEraActive(branch, currentYear)) return false;
      if (!firstRun && isMilitaryEraActive(branch, lastYear)) return false;
      return !populated.has(`${countryId}:${branch.id}`);
    });
    if (raisedBranches.length === 0) continue;

    // Built at the LIVE year so the new service fields the kit of the year it is founded,
    // not the kit of the year the world started. The era still caps tech tier.
    const roster = buildCountryRoster(countryId, ROSTER_REGION_STUB, 1, era, currentYear);
    if (roster.length === 0) continue;

    for (const branch of raisedBranches) {
      const branchUnits = roster.filter((unit) => unit.branchId === branch.id);
      if (branchUnits.length === 0) continue;

      staged.push(...branchUnits.map((unit) => ({ _id: new ObjectId(), ...unit })));
      result.raised.push(`${countryId}:${branch.id} x${branchUnits.length}`);

      if (postNews) {
        const countryName = COUNTRY_CONFIGS[countryId]?.name ?? countryId;
        const title = `${countryName} Raises the ${branch.name}`;
        await createSystemNewsPost(
          `${countryName} has formally established its ${branch.name} (${branch.abbr}). ` +
            `The first ${branchUnits.length} formations have been raised and report to the ` +
            `defence ministry, which may now set their postures and assign commanders.`,
          "executive",
          { title }
        );
        result.posted.push(title);
      }
    }
  }

  if (staged.length > 0) await units.insertMany(staged);

  await (
    await getGameStateCollection(db)
  ).updateOne({ _id: "current" }, { $set: { lastMilitaryBranchYearProcessed: currentYear } });

  return { ...result, ran: true, ...(firstRun ? { healed: true } : {}) };
}
