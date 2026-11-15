/**
 * The changelog vocabulary, defined once. Badge and area values must live here
 * so the loader's filter sets, CI guard, and feed style maps derive from a
 * single source; adding a value is one edit and the compiler names every
 * surface that must handle it.
 *
 * Badges say how big the release is. Descriptive words for what the change was
 * about ("balance", "economy", "elections") belong in `tags`, which is free
 * text, not here.
 */
export const BADGE_VALUES = ["major", "minor", "patch", "hotfix"] as const;

/**
 * Areas say which part of the codebase moved. `engine` is the hourly turn
 * processor and the simulation phases behind it: authors kept reaching for it
 * because it is genuinely neither "backend" request handling nor "frontend".
 */
export const AREA_VALUES = ["backend", "frontend", "fullstack", "engine"] as const;

export type ChangelogBadge = (typeof BADGE_VALUES)[number];
export type DevArea = (typeof AREA_VALUES)[number];

interface ChangelogPostMeta {
  version: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  badges: ChangelogBadge[];
  era?: string;
  areas?: DevArea[];
}

export interface ChangelogPost extends ChangelogPostMeta {
  /** Markdown body (without frontmatter). */
  body: string;
  /** Source filename stem, e.g. "0.4.0". */
  slug: string;
}
