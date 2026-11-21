/**
 * Career sync rules: diff what a character holds now against what they held at
 * the last sync, and turn the difference into career events.
 */
import type {
  CareerEvent,
  CareerPostCategory,
  CareerPostHolding,
  OfficeType,
} from "@/lib/db/types/character";

/** A post held right now, as read from its source collection. */
export interface HeldPost {
  characterId: string;
  key: string;
  label: string;
  category: CareerPostCategory | "office";
  /** Start date the source records, when it records one. */
  since: Date | null;
  office?: OfficeType;
}

const OFFICE_EXIT_TYPES = new Set<CareerEvent["type"]>([
  "resigned",
  "removed",
  "lost_election",
  "left_office",
]);

/**
 * Identity of an office for exit detection. Seat counts, classes and
 * constituency spellings vary between the character and official records, so
 * only the type, state and cabinet position count.
 */
export function officeKey(office: OfficeType): string {
  const record = office as unknown as Record<string, unknown>;
  const state = typeof record.state === "string" ? record.state : "";
  const positionId = typeof record.positionId === "string" ? record.positionId : "";
  return `office:${office.type}:${state}:${positionId}`;
}

/** "Secretary-General, United Nations", or the title alone when it names the org. */
export function internationalLeaderLabel(title: string, orgName: string): string {
  return / of /i.test(title) ? title : `${title}, ${orgName}`;
}

export interface CareerSyncPlan {
  events: CareerEvent[];
  next: CareerPostHolding[];
  changed: boolean;
}

/**
 * Pure diff for one character. `held` is everything the character holds now
 * (posts and offices); `stored` is what they held at the last sync.
 */
export function planCareerSync(input: {
  stored: readonly CareerPostHolding[] | undefined;
  held: readonly HeldPost[];
  history: readonly CareerEvent[] | undefined;
  now: Date;
}): CareerSyncPlan {
  const stored = input.stored ?? [];
  const storedByKey = new Map(stored.map((p) => [p.key, p]));
  const heldByKey = new Map<string, HeldPost>();
  for (const post of input.held) if (!heldByKey.has(post.key)) heldByKey.set(post.key, post);

  const events: CareerEvent[] = [];
  const next: CareerPostHolding[] = [];

  for (const post of heldByKey.values()) {
    const previous = storedByKey.get(post.key);
    if (previous) {
      next.push(previous);
      continue;
    }
    const since = post.since ?? input.now;
    next.push({
      key: post.key,
      label: post.label,
      category: post.category,
      since,
      ...(post.office ? { office: post.office } : {}),
    });
    // Taking an office already writes its own elected/appointed event.
    if (post.category === "office") continue;
    events.push({
      type: "took_post",
      officeLabel: post.label,
      postCategory: post.category,
      postKey: post.key,
      date: since,
    });
  }

  for (const previous of stored) {
    if (heldByKey.has(previous.key)) continue;
    if (previous.category === "office") {
      if (!previous.office) continue;
      if (officeExitRecorded(input.history, previous.key)) continue;
      events.push({
        type: "left_office",
        office: previous.office,
        officeLabel: previous.label,
        date: input.now,
      });
      continue;
    }
    events.push({
      type: "left_post",
      officeLabel: previous.label,
      postCategory: previous.category,
      postKey: previous.key,
      date: input.now,
    });
  }

  const changed =
    events.length > 0 ||
    next.length !== stored.length ||
    input.stored === undefined ||
    next.some((p, i) => stored[i]?.key !== p.key);
  return { events, next, changed };
}

/** True when the latest history event for this office already closes it. */
function officeExitRecorded(history: readonly CareerEvent[] | undefined, key: string): boolean {
  const events = history ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event.office || officeKey(event.office) !== key) continue;
    return OFFICE_EXIT_TYPES.has(event.type);
  }
  return false;
}
