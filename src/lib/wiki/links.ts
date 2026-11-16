const WIKI_HOST_RE = /^https?:\/\/wiki\.ahousedividedgame\.com(\/[^\s]*)?$/i;
const MAIN_HOST_WIKI_RE = /^https?:\/\/(?:www\.)?ahousedividedgame\.com(\/wiki(?:\/[^\s]*)?)$/i;

/**
 * Turns an absolute link to our own wiki into a /wiki path so it stays on
 * whichever host the reader is on (main site, wiki subdomain or sandbox).
 * Other URLs are returned unchanged.
 */
export function toRelativeWikiHref(href: string): string {
  const wikiHost = href.match(WIKI_HOST_RE);
  if (wikiHost) {
    const rest = wikiHost[1] ?? "/";
    if (rest.startsWith("/wiki/") || rest === "/wiki") return rest;
    return rest === "/" ? "/wiki" : `/wiki${rest}`;
  }
  const mainHost = href.match(MAIN_HOST_WIKI_RE);
  if (mainHost) return mainHost[1];
  return href;
}

/** Search words from a slug-shaped path segment, for the 404 suggestions. */
export function slugToSearchQuery(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  return decoded
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}
