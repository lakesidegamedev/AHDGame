import { ensureCampaignCrisisContent } from "@/lib/livingConflict/campaignCrisis";
import { ensureBuiltinCrisisV2Content } from "./builtins";
import type { CrisisDefinition } from "@/lib/crises/v2/types";
import { ensureLegacyCrisisContent } from "./legacyContent";
import { getCrisisDefinition } from "./registry";

/**
 * Loads every crisis definition into this process's registry. Definitions are
 * process-local, so each entry point that reads or acts on them calls this
 * first; it is cheap and does nothing once the content is in place.
 */
export function ensureCrisisV2Definitions(): void {
  ensureBuiltinCrisisV2Content();
  ensureLegacyCrisisContent();
  ensureCampaignCrisisContent();
}

/** A definition by id, loading the built-in content first if it is not there yet. */
export function resolveCrisisDefinition(id: string): CrisisDefinition | undefined {
  const known = getCrisisDefinition(id);
  if (known) return known;
  ensureCrisisV2Definitions();
  return getCrisisDefinition(id);
}
