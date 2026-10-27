/**
 * Book-assembly helpers for the clearing pass.
 *
 * Both replace a per-row pattern that copied a growing array (or scanned it) on
 * every row:
 *
 *   book.set(key, [...(book.get(key) ?? []), row])   // O(n^2) copies
 *   rows.find((row) => row.id === id)                // O(n) per lookup
 *
 * The appended order and the resolved row are exactly the same as those forms,
 * so every book keeps the iteration order the clearing pass already had.
 */

/** Append one row to its key's list in place, creating the list on first use. */
export function appendToBook<K, V>(book: Map<K, V[]>, key: K, value: V): V[] {
  const list = book.get(key);
  if (list === undefined) {
    const created = [value];
    book.set(key, created);
    return created;
  }
  list.push(value);
  return list;
}

/**
 * Index rows by id once, for the per-row lookups inside a commodity's pass.
 * A duplicate id keeps the FIRST row, matching the linear `find` it replaces.
 */
export function indexRowsById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return byId;
}
