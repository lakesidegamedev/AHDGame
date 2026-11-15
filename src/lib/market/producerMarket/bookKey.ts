const keys = new Map<string, string>();

/** Stable id of one commodity book; memoised because it is built per order per round. */
export function bookKey(commodity: string, book: string): string {
  const id = `${commodity}\u0000${book}`;
  let key = keys.get(id);
  if (key === undefined) keys.set(id, (key = JSON.stringify([commodity, book])));
  return key;
}
