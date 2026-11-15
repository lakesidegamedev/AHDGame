/**
 * Duplicate guard: how much of one preset's dataset is a copy of another's.
 * Numeric tables are compared value by value; strings (names, ids) are not
 * counted, because two eras legitimately share region names and ids.
 */

/** A dataset this close to another preset's is treated as copied. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.95;

/**
 * Every finite number in `value`, keyed by its path. Array elements carrying an
 * `_id` or `countryId` are keyed by it, so a reordered roster still lines up.
 */
export function numericLeaves(
  value: unknown,
  prefix = "",
  out: Map<string, number> = new Map()
): Map<string, number> {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.set(prefix, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const key =
        item && typeof item === "object" && ("_id" in item || "countryId" in item)
          ? String((item as { _id?: unknown; countryId?: unknown })._id ?? item.countryId)
          : String(index);
      numericLeaves(item, `${prefix}[${key}]`, out);
    });
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      numericLeaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

/**
 * Share of numeric leaves that are equal in both datasets, over the larger of
 * the two leaf sets. 0 when either has no numbers to compare.
 */
export function numericSimilarity(a: unknown, b: unknown): number {
  const left = numericLeaves(a);
  const right = numericLeaves(b);
  const size = Math.max(left.size, right.size);
  if (left.size === 0 || right.size === 0) return 0;
  let equal = 0;
  for (const [path, value] of left) {
    if (right.get(path) === value) equal++;
  }
  return equal / size;
}
