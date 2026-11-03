/**
 * Player-chosen tweaks to the grouped-cards desktop navigation: destinations
 * pinned to the top bar, and a custom order for each dropdown group. Saved to
 * the account. Unknown or stale ids are harmless: a pin or order entry that no
 * longer matches a destination is skipped when the menus are built.
 */

export const MAX_NAV_PINS = 5;
const MAX_ORDER_GROUPS = 40;
const MAX_IDS_PER_GROUP = 60;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export interface NavCustomization {
  /** Pin keys (`menu:item`), in top-bar order. */
  pinned: string[];
  /** Item ids per `menu:group`, in the player's order. */
  order: Record<string, string[]>;
}

export const EMPTY_NAV_CUSTOMIZATION: NavCustomization = { pinned: [], order: {} };

export function navPinKey(menuId: string, itemId: string): string {
  return `${menuId}:${itemId}`;
}

export function navGroupKey(menuId: string, groupId: string): string {
  return `${menuId}:${groupId}`;
}

function idList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id));
  return [...new Set(ids)].slice(0, max);
}

export function navCustomization(value: unknown): NavCustomization {
  if (!value || typeof value !== "object") return EMPTY_NAV_CUSTOMIZATION;
  const raw = value as { pinned?: unknown; order?: unknown };
  const order: Record<string, string[]> = {};
  if (raw.order && typeof raw.order === "object" && !Array.isArray(raw.order)) {
    for (const [key, ids] of Object.entries(raw.order).slice(0, MAX_ORDER_GROUPS)) {
      if (!ID_PATTERN.test(key)) continue;
      const list = idList(ids, MAX_IDS_PER_GROUP);
      if (list.length > 0) order[key] = list;
    }
  }
  return { pinned: idList(raw.pinned, MAX_NAV_PINS), order };
}

/**
 * Puts top-level items in the saved order. Items missing from the saved list
 * keep their default order after the saved ones. Nested items stay directly
 * after their parent.
 */
export function applySavedOrder<T extends { id: string; parentId?: string }>(
  items: T[],
  saved: string[] | undefined
): T[] {
  if (!saved || saved.length === 0) return items;
  const ids = new Set(items.map((item) => item.id));
  const isRoot = (item: T) => !item.parentId || !ids.has(item.parentId);
  const roots = items.filter(isRoot);
  const rank = (id: string) => {
    const index = saved.indexOf(id);
    return index < 0 ? saved.length : index;
  };
  const sorted = roots
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.index - b.index)
    .map(({ item }) => item);
  return sorted.flatMap((root) => [
    root,
    ...items.filter((item) => !isRoot(item) && item.parentId === root.id),
  ]);
}

export function togglePin(custom: NavCustomization, key: string): NavCustomization {
  const pinned = custom.pinned.includes(key)
    ? custom.pinned.filter((pin) => pin !== key)
    : [...custom.pinned, key].slice(-MAX_NAV_PINS);
  return { ...custom, pinned };
}

/** Moves `list[from]` to index `to`, clamped. Returns a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}
