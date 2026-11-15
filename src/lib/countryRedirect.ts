/**
 * Resolve the country-scoped destination for a legacy root URL such as
 * `/politicians?country=uk`.
 *
 * These roots previously redirected client-side after hydration, so the
 * server returned an empty shell with no HTTP redirect and crawlers, link
 * previews and text-only views saw a blank page. Resolving here lets the
 * route page redirect on the server instead.
 */
export type RedirectSearchParams = Record<string, string | string[] | undefined>;

export function countryScopedUrl(path: string, searchParams?: RedirectSearchParams): string {
  const rawCountry = searchParams?.country;
  const country = (Array.isArray(rawCountry) ? rawCountry[0] : rawCountry)?.toLowerCase() || "us";
  return `/country/${country}/${path}`;
}

/** Legacy root paths that moved under `/country/<code>/`. */
export const LEGACY_COUNTRY_ROOTS = [
  "parties",
  "parties/:id",
  "parties/coalition/:id",
  "politicians",
  "approval",
  "budget",
  "policy",
] as const;

/**
 * HTTP redirects for the legacy roots, for `next.config.ts`. The route pages
 * call `redirect()`, but their loading boundary starts streaming first, so the
 * server still answered 200 with an empty shell and the browser redirected a
 * second later. A config redirect answers before any render. A
 * `?country=` query picks the country, as `countryScopedUrl` does; otherwise
 * it is the US.
 */
export function legacyCountryRootRedirects() {
  return LEGACY_COUNTRY_ROOTS.flatMap((path) => [
    {
      source: `/${path}`,
      has: [{ type: "query" as const, key: "country", value: "(?<country>[A-Za-z]{2,3})" }],
      destination: `/country/:country/${path}`,
      permanent: true,
    },
    { source: `/${path}`, destination: `/country/us/${path}`, permanent: true },
  ]);
}
