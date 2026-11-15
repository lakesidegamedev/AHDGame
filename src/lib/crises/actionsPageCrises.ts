import type { Crisis, CrisisDecisionNode, CrisisInteraction } from "@/lib/db/types/crisis";

export interface ActionsPageCrisisEntry {
  crisis: Crisis;
  interaction: CrisisInteraction | null;
  currentNode: CrisisDecisionNode | null;
  canInteract: boolean;
  /** Crisis v2 summary when the crisis carries v2 state. */
  v2?: { levers: readonly unknown[] } | null;
}

function hasLevers(entry: ActionsPageCrisisEntry): boolean {
  return (entry.v2?.levers.length ?? 0) > 0;
}

/**
 * Whether an enriched crisis should appear on the Actions page.
 *
 * Actionable decision prompts (for roles the character holds) are shown. Every
 * other crisis reaching this character is shown as an AMBIENT card when it
 * still carries effects, so players know they are affected. Only crises with
 * nothing to decide AND nothing to feel are hidden.
 *
 * "Ambient" is a property of the character, not the crisis: it is ambient to
 * anyone who cannot act on it and it still hits their metrics. Hiding the
 * PROMPT is a separate job: `sanitizeCrisisForActionsPage` nulls `currentNode`,
 * and `CrisisActionCard` renders the decision block only under `canInteract`.
 */
export function shouldShowCrisisOnActionsPage(
  entry: ActionsPageCrisisEntry,
  isLocalCrisis: boolean
): boolean {
  if (hasLevers(entry)) return true;

  if (!isLocalCrisis) {
    return entry.currentNode?.type === "collective" && entry.canInteract;
  }

  if (entry.v2) return true;

  if (entry.currentNode && entry.canInteract && !entry.interaction?.resolvedAt) {
    return true;
  }

  return entry.crisis.effects.length > 0;
}

/**
 * Strip decision state from an entry the character cannot act on before it is
 * sent to the client:
 *  - currentNode is the prompt itself.
 *  - interaction is live decision state and carries leaderResponses, where
 *    covert campaign choices live; the card reads it only under canInteract.
 *  - crisis.interactionDefinition is the bulk of an ambient card's payload,
 *    and this feed is polled once a minute by every player.
 */
export function sanitizeCrisisForActionsPage<T extends ActionsPageCrisisEntry>(entry: T): T {
  // The v2 state carries the whole accountability ledger; the card reads the
  // trimmed `v2` summary instead.
  const { v2: _instance, ...base } = entry.crisis;
  if (entry.canInteract) return { ...entry, crisis: base as T["crisis"] };

  const { interactionDefinition: _omitted, ...crisis } = base;
  return { ...entry, crisis: crisis as T["crisis"], currentNode: null, interaction: null };
}

/**
 * Ordering for the Actions page feed.
 *
 * A decision the character can actually take comes first. Ambient cards are
 * shown so players know what is hitting them, but there can be several of them
 * at once (six on the live world for a US player during the war scare), and
 * without this a real prompt could render below a stack of crises the character
 * can do nothing about. Ties break newest-first, then on id, so the order is
 * total and stable — this response is ETagged, and a feed that reshuffles
 * between polls would defeat the 304.
 */
export function compareActionsPageCrises(
  a: ActionsPageCrisisEntry,
  b: ActionsPageCrisisEntry
): number {
  const actionable = Number(b.canInteract || hasLevers(b)) - Number(a.canInteract || hasLevers(a));
  if (actionable !== 0) return actionable;
  const recency = b.crisis.startTurn - a.crisis.startTurn;
  if (recency !== 0) return recency;
  return a.crisis._id.toString().localeCompare(b.crisis._id.toString());
}
