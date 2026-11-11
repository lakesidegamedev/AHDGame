import type { Db } from "mongodb";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { logger } from "@/lib/observability/logger";

/**
 * Switches for systems that would change a running world the moment a build
 * deploys. Fresh worlds seed each one true; a world seeded before the system
 * existed has the field absent and keeps its old behaviour until an operator
 * turns it on.
 */
export type LiveWorldSwitch =
  | "crisisV2StagesEnabled"
  | "executiveSuccessionEnabled"
  | "leaderLegacyEnabled"
  | "campaignLiveGdpBasisEnabled"
  | "byElectionFillEnabled"
  | "scotusNppNominationsEnabled"
  | "scotusPendingDocketEnabled"
  | "preeGenericFallbackEnabled";

/** True only when the world's gameConfig sets the switch to true. An unreadable config reads off. */
export async function isLiveWorldSwitchOn(db: Db, key: LiveWorldSwitch): Promise<boolean> {
  try {
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { [key]: 1 } }
    );
    return config?.[key] === true;
  } catch (error) {
    logger.warn("liveWorldSwitches", `${key} unreadable; held off`, { error: String(error) });
    return false;
  }
}
