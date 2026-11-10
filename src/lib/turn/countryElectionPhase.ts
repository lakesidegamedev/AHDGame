import * as Sentry from "@sentry/nextjs";
import type { CountryId } from "@/lib/constants/countries";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";

export interface CountryElectionEntry {
  name: string;
  fn: (gameNow: Date, currentTurn?: number) => Promise<unknown>;
}

export type CountryElectionRegistry = Partial<Record<CountryId, CountryElectionEntry[]>>;

/** Spawner entries for the countries in play, in registry order. */
export function selectCountryElectionEntries(
  registry: CountryElectionRegistry,
  inPlay: ReadonlySet<string>
): CountryElectionEntry[] {
  return Object.entries(registry)
    .filter(([id]) => inPlay.has(id))
    .flatMap(([, entries]) => entries ?? []);
}

export interface CountryElectionsResult {
  /** Spawners run this turn. */
  families: number;
  /** Spawner names that threw. */
  failed: string[];
  /** Wall time per spawner, for finding the slow families. */
  durationMs: Record<string, number>;
}

/**
 * Runs every spawner at once inside a single turn phase. One failing family
 * does not stop the others, and the phase fails after all have settled.
 */
export async function runCountryElectionEntries(
  entries: readonly CountryElectionEntry[],
  gameNow: Date,
  currentTurn: number
): Promise<CountryElectionsResult> {
  const durationMs: Record<string, number> = {};
  const failed: string[] = [];
  let mustStop: TurnMustStopError | null = null;
  let firstError: unknown = null;

  await Promise.all(
    entries.map(async ({ name, fn }) => {
      const startedAt = Date.now();
      try {
        await fn(gameNow, currentTurn);
      } catch (error) {
        failed.push(name);
        firstError ??= error;
        if (error instanceof TurnMustStopError) mustStop ??= error;
        console.error(`[Turn] Country election family "${name}" failed`, error);
        Sentry.captureException(error, { extra: { phase: "countryElections", family: name } });
      } finally {
        durationMs[name] = Date.now() - startedAt;
      }
    })
  );

  if (mustStop) throw mustStop;
  if (failed.length > 0) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    throw new Error(`Country elections failed for ${failed.join(", ")}: ${message}`);
  }
  return { families: entries.length, failed, durationMs };
}
