const keys = new Map<string, Map<string, string>>();

/**
 * Stable id of one commodity book; memoised because it is built per order per
 * round. Nested maps avoid building a lookup string on every call.
 */
export function bookKey(commodity: string, book: string): string {
  let byBook = keys.get(commodity);
  if (byBook === undefined) keys.set(commodity, (byBook = new Map()));
  let key = byBook.get(book);
  if (key === undefined) byBook.set(book, (key = JSON.stringify([commodity, book])));
  return key;
}
