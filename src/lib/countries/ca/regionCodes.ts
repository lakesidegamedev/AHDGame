/** Canadian public region codes omit the storage namespace; other identifiers stay unchanged. */
export function displayCanadianRegionCode(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.replace(/^CA_(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/i, (_match, code: string) =>
        code.toUpperCase()
      )
    : "";
}

export function canonicalCanadianPlayerPath(pathname: string): string | null {
  const path = pathname.replace(
    /(^\/(?:elections\/[^/]+\/)?country\/ca\/(?:region|referendums)\/)CA_(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)(?=\/|$)/i,
    (_match, prefix: string, region: string) => `${prefix}${region.toUpperCase()}`
  );
  return path === pathname ? null : path;
}

export function canonicalCanadianPlayerUrl(href: string): string | null {
  const url = new URL(href);
  const path = canonicalCanadianPlayerPath(url.pathname);
  let changed = path !== null;
  if (path) url.pathname = path;
  const key = /^\/country\/ca\/elections\/?$/i.test(url.pathname)
    ? "state"
    : url.pathname === "/campaign-manager"
      ? "region"
      : null;
  if (key) {
    const value = url.searchParams.get(key);
    if (
      value &&
      displayCanadianRegionCode(value) !== value &&
      (!url.searchParams.get("country") || url.searchParams.get("country")?.toUpperCase() === "CA")
    ) {
      changed = true;
      url.searchParams.set(key, displayCanadianRegionCode(value));
      if (key === "region" && !url.searchParams.has("country"))
        url.searchParams.set("country", "CA");
    }
  }
  return changed ? url.href : null;
}
