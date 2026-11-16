export interface WikiHeading {
  id: string;
  text: string;
  level: number;
}

/** Anchor id for a heading. Must match the ids the article renderer assigns. */
export function wikiHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Level 2 and 3 markdown headings, in document order. */
export function extractWikiHeadings(content: string): WikiHeading[] {
  const headings: WikiHeading[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^(##|###)\s+(.+)$/);
    if (!match) continue;
    const text = match[2].trim();
    headings.push({ id: wikiHeadingId(text), text, level: match[1].length });
  }
  return headings;
}
