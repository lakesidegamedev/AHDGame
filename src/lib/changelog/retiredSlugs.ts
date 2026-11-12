/**
 * Retired public changelog slugs and where they now live.
 *
 * `/changelog/<slug>` is the published address of an entry and these were in
 * the sitemap, so they must keep resolving: they are linked from Discord, the
 * wiki and players' posts. Nothing else may be added here; a release post is
 * never retired.
 */
export const RETIRED_PUBLIC_CHANGELOG_SLUGS: Readonly<Record<string, string>> = {
  "1.1.1": "1.1.0",
  "1.1.2": "1.1.0",
  "1.1.7": "1.1.0",
  "1.1.8": "1.1.0",
  "1.2.1": "1.2.0",
  "1.2.16": "1.2.0",
  "1.2.59": "1.2.0",
  "1.4.3": "1.4.0",
  "1.4.10": "1.4.0",
  "1.4.11": "1.4.0",
  "1.4.41": "1.4.0",
  "1.4.42": "1.4.0",
  "1.4.43": "1.5.0",
  "1.4.44": "1.5.0",
  "1.4.45": "1.5.0",
  "1.4.46": "1.5.0",
  "1.4.47": "1.5.0",
  "1.4.48": "1.5.0",
  "1.4.49": "1.5.0",
  "1.4.58": "1.6.0",
};

/** Permanent redirects for next.config, one per retired address. */
export function retiredChangelogRedirects(): {
  source: string;
  destination: string;
  permanent: true;
}[] {
  return Object.entries(RETIRED_PUBLIC_CHANGELOG_SLUGS).map(([from, to]) => ({
    source: `/changelog/${from}`,
    destination: `/changelog/${to}`,
    permanent: true,
  }));
}
