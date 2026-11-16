/** Finds an unfinished `[[query` before the caret, and swaps it for a link. */

export interface WikilinkQuery {
  /** Index of the first `[` of the opening `[[`. */
  start: number;
  query: string;
}

export function findWikilinkQuery(text: string, caret: number): WikilinkQuery | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const query = before.slice(open + 2);
  if (query.includes("\n") || query.includes("]") || query.length > 80) return null;
  return { start: open, query };
}

export function applyWikilink(
  text: string,
  caret: number,
  match: WikilinkQuery,
  title: string,
  href: string
): { text: string; caret: number } {
  const safeTitle = title.replace(/[[\]]/g, "");
  const link = `[${safeTitle}](${href})`;
  // Drop a closing `]]` the writer already typed so it does not double up.
  const after = text.slice(caret);
  const rest = after.startsWith("]]") ? after.slice(2) : after;
  return {
    text: text.slice(0, match.start) + link + rest,
    caret: match.start + link.length,
  };
}
