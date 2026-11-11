import type { Db } from "mongodb";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { COUNTRY_ELECTION_PHASES } from "@/lib/turn/countryPhases";
import { electionsCollection } from "@/lib/db/repositories/elections";
import type { Document } from "mongodb";

/**
 * Election families that `bootstrapGameWorld` offers an explicit opt-out for.
 * Keyed by the phase name in {@link COUNTRY_ELECTION_PHASES}.
 */
const SKIP_REGIONAL_COUNCIL_PHASES = new Set(["ukRegionalCouncilElections"]);

export interface FoundingSpawnResult {
  /** Families invoked (after opt-outs). */
  attempted: number;
  /** Families whose spawner threw. */
  failed: number;
  /** `elections` documents at `cycle: 0` once the sweep finished. */
  foundingRaces: number;
}

// Spawn the cycle-0 founding race for EVERY registered election family.
//
// Why its own sweep rather than more entries in bootstrapGameWorld's
// ensure* battery: that battery is hand-maintained and has drifted from
// COUNTRY_ELECTION_PHASES (the registry the TURN LOOP iterates). On a normal
// world drift self-heals on turn 1, but founding phase suppresses every
// canonical spawner while preIteration.active, so a family missing from the
// battery gets no cycle-0 race and its chamber stays empty. Driving the
// founding spawn from the turn loop's own registry means they cannot drift
// again.
//
// Safety relied on (all pre-existing):
// - every ensure* is idempotent (skips families with active/upcoming race).
// - every ensure* self-gates on countryGameStates.status and era anchor.
// - pickNextCanonicalCycle returns cycle 0 with a fixed window while
//   preIterationActive, so all classes found together and the phase converges.
//
// Entries run sequentially per country because some mirror a sibling race
// (DE Minister-President after Landtag, JP Regional Council after Shugiin).
// COUNTRIES run concurrently: both documented dependencies are intra-country,
// and the turn loop already drives all entries concurrently each turn, so
// this is strictly more conservative than production.
//
// A failing family does not stop the rest; the aggregate failure count is
// returned so bootstrap can fail or mark reset partial.
//
// Failure logs are buffered per country and flushed in registry order, so
// the seed op-profiler's log parsing (gaps, repeated passes) sees the same
// output as the sequential version regardless of completion order.
export async function spawnFoundingElections(
  db: Db,
  now: Date,
  options: { skipRegionalCouncil?: boolean; log?: (msg: string) => void; preset?: string } = {}
): Promise<FoundingSpawnResult> {
  const log = options.log ?? (() => {});
  const skipRegionalCouncil = options.skipRegionalCouncil === true;

  // Background countries (#5702) hold no full-engine elections.
  const countries = Object.entries(COUNTRY_ELECTION_PHASES).filter(
    ([countryId]) => !isBackgroundInPreset(options.preset, countryId)
  );
  const perCountry = await Promise.all(
    countries.map(async ([countryId, entries]) => {
      let attempted = 0;
      let failed = 0;
      const lines: string[] = [];
      for (const { name, fn } of entries ?? []) {
        if (skipRegionalCouncil && SKIP_REGIONAL_COUNCIL_PHASES.has(name)) continue;
        attempted++;
        try {
          await fn(now);
        } catch (error) {
          failed++;
          lines.push(
            `Founding spawn failed for ${countryId}/${name}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      return { attempted, failed, lines };
    })
  );

  // Flushed in registry order, so the log does not depend on completion order.
  for (const { lines } of perCountry) for (const line of lines) log(line);
  const attempted = perCountry.reduce((sum, c) => sum + c.attempted, 0);
  const failed = perCountry.reduce((sum, c) => sum + c.failed, 0);

  const foundingRaces = await electionsCollection<Document>(db).countDocuments({ cycle: 0 });
  log(
    `Founding spawn sweep: ${attempted} family/families across ${
      Object.keys(COUNTRY_ELECTION_PHASES).length
    } countries, ${foundingRaces} cycle-0 race(s)` +
      (failed > 0 ? ` (${failed} family/families failed — see above)` : "")
  );

  return { attempted, failed, foundingRaces };
}
