/** Unread badge text: the true count up to 99, then "99+". */
export function unreadBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Opens on "Needs action" only when something needs action; otherwise on the unread items. */
export function defaultInboxSegment(counts: { action: number; all: number }): "action" | "all" {
  return counts.action === 0 && counts.all > 0 ? "all" : "action";
}
