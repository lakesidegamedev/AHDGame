import { withSessionDb } from "@/lib/db/sessionDb";
import { loadAccountabilityAttributions } from "./attribution";
import { freezeAccountabilityAttributions } from "@/lib/crises/v2/accountability";
import type { Db, ObjectId } from "mongodb";
import type {
  CrisisDefinition,
  CrisisInstance,
  ForcedEventThreshold,
  PendingDelivery,
} from "@/lib/crises/v2/types";
import { logger } from "@/lib/observability/logger";
import { settleCrisisConsequences } from "./consequences";
import { runForcedEvents } from "./forcedEventsShell";
import { crisesCollection } from "@/lib/db/repositories/crises";

const COMPONENT = "crisisV2PendingDelivery";

export interface DeliveryTarget {
  crisisId: ObjectId;
  regionIds: readonly string[];
  scope: CrisisInstance["scope"];
  stateIds: readonly string[];
  countryIds: readonly string[];
  label: string;
  def: CrisisDefinition;
}

/** The delivery a step owes after it fires forced events or reaches aftermath. */
export function owedDelivery(
  previous: PendingDelivery | undefined,
  owes: { consequences: boolean; forced: readonly ForcedEventThreshold[] }
): PendingDelivery | undefined {
  const forced = [...new Set([...(previous?.forced ?? []), ...owes.forced.map((t) => t.id)])];
  const consequences = previous?.consequences === true || owes.consequences;
  if (!consequences && forced.length === 0) return previous;
  return {
    ...previous,
    ...(consequences ? { consequences } : {}),
    ...(forced.length > 0 ? { forced } : {}),
  };
}

/**
 * Writes what a saved instance still owes the world, then clears it. Each
 * individual write is idempotent or receipted, so a failure part way leaves
 * only the unfinished work pending and the next turn finishes it without
 * repeating what already landed.
 */
export async function deliverPending(
  db: Db,
  instance: Pick<CrisisInstance, "ledger" | "pendingDelivery">,
  target: DeliveryTarget,
  turn: number
): Promise<void> {
  const pending = instance.pendingDelivery;
  if (!pending) return;
  const applied = new Set(pending.applied ?? []);
  let consequences = pending.consequences === true;
  let forced = [...(pending.forced ?? [])];

  try {
    if (consequences) {
      await withSessionDb(db, async (tx) => {
        const saved = await crisesCollection(tx).findOne(
          { _id: target.crisisId },
          { projection: { "v2.ledger": 1, "v2.pendingDelivery": 1 } }
        );
        if (saved?.v2 && saved.v2.pendingDelivery?.consequences !== true) return;
        const ledger = saved?.v2?.ledger ?? instance.ledger;
        const actors = await loadAccountabilityAttributions(
          tx,
          ledger.filter((row) => row.attribution === undefined).map((row) => row.holderId)
        );
        const frozen = freezeAccountabilityAttributions(ledger, actors, target.regionIds);
        await settleCrisisConsequences(
          tx,
          { ledger: frozen },
          { crisisId: target.crisisId, scope: target.scope, regionIds: target.regionIds },
          turn,
          { done: applied, mark: () => undefined }
        );
        await crisesCollection(tx).updateOne(
          { _id: target.crisisId },
          { $set: { "v2.ledger": frozen }, $unset: { "v2.pendingDelivery.consequences": "" } }
        );
      });
      consequences = false;
    }
  } catch (error) {
    logger.error(COMPONENT, "consequences not delivered; retried next turn", error, {
      crisisId: target.crisisId.toString(),
    });
  }

  const owed = target.def.forcedEvents.filter((threshold) => forced.includes(threshold.id));
  if (owed.length > 0) {
    try {
      await runForcedEvents(
        db,
        owed,
        {
          crisisId: target.crisisId.toString(),
          label: target.label,
          stateIds: target.stateIds,
          countryIds: target.countryIds,
          turn,
          def: target.def,
        },
        (threshold) => {
          forced = forced.filter((id) => id !== threshold.id);
        }
      );
    } catch (error) {
      logger.error(COMPONENT, "forced events not delivered; retried next turn", error);
    }
  }
  // an id the definition no longer carries can never be delivered
  forced = forced.filter((id) => owed.some((threshold) => threshold.id === id));

  const remaining: PendingDelivery | null =
    consequences || forced.length > 0
      ? {
          ...(consequences ? { consequences } : {}),
          ...(forced.length > 0 ? { forced } : {}),
          ...(applied.size > 0 ? { applied: [...applied] } : {}),
        }
      : null;
  try {
    await crisesCollection(db).updateOne(
      { _id: target.crisisId },
      remaining
        ? { $set: { "v2.pendingDelivery": remaining } }
        : { $unset: { "v2.pendingDelivery": "" } }
    );
  } catch (error) {
    logger.error(COMPONENT, "could not record delivery progress", error, {
      crisisId: target.crisisId.toString(),
    });
  }
}
