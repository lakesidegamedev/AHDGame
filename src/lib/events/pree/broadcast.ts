/**
 * Broadcast events: shared historic moments (moon landing, the Wall coming
 * down) offered to every eligible character at once instead of the usual
 * one-random-event-per-character weighted pick.
 *
 * - A definition opts in with `broadcast: "country" | "global"` plus a
 *   `minYear`/`maxYear` window; it fires on the first turn in window.
 * - "country" also respects `requiresCountryIds`; "global" reaches all.
 * - Each broadcast fires AT MOST ONCE per world, tracked in the shared
 *   cooldown ledger under a synthetic scope ({@link broadcastScopeId}).
 * - Only one broadcast fires per turn; others stay due for later turns.
 * - Broadcasts bypass the per-character global spacing cooldown, and a
 *   pending event is superseded (auto-resolved on its default option) so
 *   the historic moment always lands.
 * - Broadcast definitions never enter the weighted pool, so `baseWeight`
 *   is unused for them.
 */
import type { Db } from "mongodb";
import type { EventDefinition } from "@/lib/db/types/events";
import type { EventCooldownLedger } from "@/lib/db/types/events";
import { getEventCooldownLedgerCollection } from "@/lib/db/collections/eventCooldownLedger";
import { countryScopeId } from "@/lib/events/substrate/countryScopeId";
import { getLastFiredTurn, recordScheduledCountryFire } from "@/lib/events/substrate/cooldown";
import { isWithinYearWindow } from "@/lib/events/substrate/yearWindow";
import { getDefaultOptionId, getEventHandler } from "@/lib/events/substrate/registry";
import { EventNotResolvableError, resolveEvent } from "@/lib/events/substrate/resolve";
import type { EventInstance } from "@/lib/db/types/events";
import type { CharacterEventContext } from "./eligibility";

/** Synthetic ledger key for broadcast fired-markers (scope "country", key "broadcast"). */
function broadcastScopeId() {
  return countryScopeId("broadcast");
}

export async function loadBroadcastLedger(db: Db): Promise<EventCooldownLedger | null> {
  return getEventCooldownLedgerCollection(db).findOne({
    scope: "country",
    scopeId: broadcastScopeId(),
  });
}

/**
 * Returns the first approved broadcast definition whose year window contains
 * `currentYear` and which has never fired (and has a registered handler), or
 * null. Array order decides precedence when several are due the same year.
 */
export function findDueBroadcast(
  definitions: EventDefinition[],
  ledger: EventCooldownLedger | null,
  currentYear: number | undefined
): EventDefinition | null {
  if (currentYear == null) {
    return null;
  }
  for (const definition of definitions) {
    if (!definition.broadcast) {
      continue;
    }
    if (!isWithinYearWindow(definition, currentYear)) {
      continue;
    }
    if (getLastFiredTurn(ledger, definition.kind) !== undefined) {
      continue;
    }
    if (!getEventHandler(definition.kind)) {
      continue;
    }
    return definition;
  }
  return null;
}

export async function markBroadcastFired(db: Db, kind: string, currentTurn: number): Promise<void> {
  await recordScheduledCountryFire(db, broadcastScopeId(), kind, currentTurn);
}

/**
 * Clears a character's pending event so a broadcast can take its slot: the
 * pending instance is auto-resolved on its default option with timeout
 * semantics (default effects apply, marked "expired"). Returns true when the
 * slot is free afterward (or already was, e.g. a concurrent resolution),
 * false when the pending event could not be superseded.
 */
export async function supersedePendingEventForBroadcast(
  db: Db,
  instance: EventInstance,
  currentTurn: number,
  preset?: string,
  treasuryCashLedgerEnabled = false
): Promise<boolean> {
  const defaultOptionId = getDefaultOptionId(instance.kind);
  if (!defaultOptionId) {
    return false;
  }
  try {
    await resolveEvent(
      db,
      instance._id,
      defaultOptionId,
      "timeout",
      currentTurn,
      undefined,
      preset,
      treasuryCashLedgerEnabled
    );
    return true;
  } catch (err) {
    // Already resolved concurrently — the slot is free, offer can proceed.
    if (err instanceof EventNotResolvableError) {
      return true;
    }
    return false;
  }
}

/** Does this broadcast reach this character? "global" reaches everyone; "country" checks requiresCountryIds. */
export function broadcastMatchesCharacter(
  definition: EventDefinition,
  characterCtx: CharacterEventContext
): boolean {
  if (definition.broadcast === "global") {
    return true;
  }
  if (definition.broadcast === "country") {
    return (
      !definition.requiresCountryIds ||
      definition.requiresCountryIds.includes(characterCtx.countryId)
    );
  }
  return false;
}
