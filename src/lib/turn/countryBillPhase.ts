import { logger } from "@/lib/observability/logger";
import type { CountryId } from "@/lib/constants/countries";
import type { BillLifecycleRuntimeContext } from "@/lib/turn/billLifecycle/types";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";

export interface CountryBillEntry {
  phaseName: string;
  fn: (now: Date, context?: BillLifecycleRuntimeContext) => Promise<unknown>;
}

/** Bill lifecycle entries for the countries in play, in registry order. */
export function selectCountryBillEntries<E>(
  registry: Partial<Record<CountryId, E>>,
  inPlay: ReadonlySet<string>
): E[] {
  return Object.entries(registry)
    .filter(([id]) => inPlay.has(id))
    .map(([, entry]) => entry as E);
}

export interface CountryBillsResult {
  /** Lifecycles run this turn. */
  families: number;
  /** Lifecycle names that threw. */
  failed: string[];
  /** Wall time per lifecycle, for finding the slow ones. */
  durationMs: Record<string, number>;
}

/**
 * Runs every country bill lifecycle at once inside a single turn phase.
 * Results land in `collected` as each settles, so a failing country does not
 * lose the others' results; the phase fails after all have settled.
 */
export async function runCountryBillEntries(
  entries: readonly CountryBillEntry[],
  now: Date,
  context: BillLifecycleRuntimeContext,
  collected: Map<string, unknown>
): Promise<CountryBillsResult> {
  const durationMs: Record<string, number> = {};
  const failed: string[] = [];
  let mustStop: TurnMustStopError | null = null;
  let firstError: unknown = null;

  await Promise.all(
    entries.map(async ({ phaseName, fn }) => {
      const startedAt = Date.now();
      try {
        collected.set(phaseName, await fn(now, context));
      } catch (error) {
        failed.push(phaseName);
        firstError ??= error;
        if (error instanceof TurnMustStopError) mustStop ??= error;
        logger.error("Turn", `Country bill lifecycle "${phaseName}" failed`, error, {
          phase: "countryBillLifecycle",
          family: phaseName,
        });
      } finally {
        durationMs[phaseName] = Date.now() - startedAt;
      }
    })
  );

  if (mustStop) throw mustStop;
  if (failed.length > 0) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    throw new Error(`Country bill lifecycles failed for ${failed.join(", ")}: ${message}`);
  }
  return { families: entries.length, failed, durationMs };
}
