/**
 * SP5 — path classification for the macro/political store split (spec §2/§3).
 * Mixed-target writers route each metric path through this predicate: macro
 * paths write `macroMetrics` for ALL countries; political paths write
 * `stateMetrics` for non-playables (playables stay guarded per SP4).
 */

/** The stateMetrics categories that re-homed to macroMetrics. */
export const MACRO_CATEGORIES: ReadonlySet<string> = new Set(["economic", "population"]);

/**
 * `governance.*` paths that live on macroMetrics despite governance being a
 * political category. `independenceDesire` is mechanic state owned by its drift
 * phase. `budgetBalance` and `debtToGdp` are objective fiscal state synced every
 * turn from the federal budget; they also feed `economy.fiscal` through
 * TIER2_SOURCES, which reads the MACRO store.
 */
const MACRO_GOVERNANCE_PATHS: ReadonlySet<string> = new Set([
  "governance.independenceDesire",
  "governance.budgetBalance",
  "governance.debtToGdp",
]);

/**
 * True when a "category.metricId[.value]" path (or the hoisted top-level
 * "independenceDesire[.value]") lives on the macroMetrics store.
 */
export function isMacroMetricPath(metricPath: string): boolean {
  const [head, metricId] = metricPath.split(".");
  if (MACRO_CATEGORIES.has(head)) return true;
  // Hoisted mechanic field — legacy writers may still address it by its old
  // governance path; both spellings classify as macro.
  if (head === "independenceDesire") return true;
  return MACRO_GOVERNANCE_PATHS.has(`${head}.${metricId}`);
}

/**
 * Translate a legacy stateMetrics path to its macroMetrics equivalent.
 * Identity for economic/population; the independence-desire governance path
 * hoists to the top-level field.
 */
export function toMacroPath(metricPath: string): string {
  return metricPath.replace(/^governance\.independenceDesire/, "independenceDesire");
}
