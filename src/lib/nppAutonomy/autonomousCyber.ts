/**
 * Shell for cyber operations run by an NPP-governed full country. The decision is
 * `planAutonomousCyberOperation` (pure, with launch caps); this loads the head's stance, the
 * rival bloc leader, tension, resilience and history, then launches or stands down through
 * the same shell a player's service uses. Launches are paid from the intelligence
 * appropriation, so an empty appropriation is a further brake.
 */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { NPP } from "@/lib/db/types";
import type { CountryAlignment } from "@/lib/db/types/countryAlignment";
import { blocOfAlignment } from "@/lib/coldwar/rules/blocTension";
import { getColdWarTension } from "@/lib/coldwar/tension";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";
import { getIntelligenceAgenciesCollection } from "@/lib/db/collections/intelligence";
import {
  CYBER_AI_CAP_WINDOW_TURNS,
  attackerCapability,
  hawkishnessOfHead,
  planAutonomousCyberOperation,
} from "@/lib/cyber/operations";
import { loadCyberResilience } from "@/lib/cyber/resilience";
import {
  launchCyberOperation,
  loadCyberLaunchTurns,
  loadCyberPairHistory,
  standDownCyber,
} from "@/lib/cyber/runCyberOperation";
import { scriptedRoll } from "@/lib/world/macro/backgroundCyber";
import { rivalLeaderOf } from "@/lib/world/macro/rules/foreignPolicy";
import { countryAlignmentsCollection } from "@/lib/db/repositories/countryAlignments";

const INTELLIGENCE_POSITION_ID = "director_of_intelligence";
const DEFAULT_TRADECRAFT = 3;

export type AutonomousCyberResult = "launched" | "stood_down" | "none";

type HeadSlice = Pick<NPP, "personality"> & {
  policies?: { domainPositions?: { defense?: number } };
};

export async function processAutonomousCyber(
  db: Db,
  countryId: CountryId,
  head: HeadSlice,
  turn: number
): Promise<AutonomousCyberResult> {
  // A player directing the service is the only one who launches for it.
  const director = await getCabinetMembersCollection(db).findOne({
    countryId,
    positionId: INTELLIGENCE_POSITION_ID,
  });
  if (director?.characterId) return "none";

  const alignment = await countryAlignmentsCollection(db).findOne(
    { entityId: countryId },
    { projection: { entityId: 1, shares: 1, nonAligned: 1 } }
  );
  const targetId = rivalLeaderOf(blocOfAlignment(countryId, alignment ?? undefined), countryId);
  if (!targetId) return "none";

  const hawkishness = hawkishnessOfHead(
    head.policies?.domainPositions?.defense,
    head.personality.ambition
  );
  const history = await loadCyberPairHistory(db, countryId, targetId);
  const [tension, resilience, launchTurns, agency] = await Promise.all([
    getColdWarTension(db),
    loadCyberResilience(db, [countryId, targetId]),
    loadCyberLaunchTurns(db, countryId, Math.max(0, turn - CYBER_AI_CAP_WINDOW_TURNS)),
    getIntelligenceAgenciesCollection(db).then((c) =>
      c.findOne({ countryId }, { projection: { tradecraft: 1 } })
    ),
  ]);
  const tradecraft = agency?.tradecraft ?? DEFAULT_TRADECRAFT;
  const own = resilience.find((r) => r.countryId === countryId)?.resilience ?? null;
  const target = resilience.find((r) => r.countryId === targetId)?.resilience ?? null;

  const decision = planAutonomousCyberOperation({
    attackerId: countryId,
    hawkishness,
    rivalLeaderId: targetId,
    tension: tension.value,
    history,
    targetResilience: target,
    turn,
    decisionRoll: scriptedRoll(countryId, turn),
    capability: attackerCapability(own ?? 0.4, tradecraft),
    recentLaunchTurns: launchTurns,
  });

  if (decision.kind === "launch") {
    const result = await launchCyberOperation({
      db,
      attackerId: countryId,
      targetId: decision.targetId as CountryId,
      turn,
      tradecraft,
      chargeAppropriation: true,
    });
    return result.ok ? "launched" : "none";
  }
  if (decision.kind === "stand_down") {
    const result = await standDownCyber(db, countryId, decision.targetId as CountryId, turn);
    return result.ok ? "stood_down" : "none";
  }
  return "none";
}
