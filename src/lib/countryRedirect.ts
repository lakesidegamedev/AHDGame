/**
 * Resolve the country-scoped destination for a legacy root URL such as
 * `/politicians?country=uk`.
 *
 * These root routes used to be client components that called `redirect()`
 * after hydration. The server therefore answered with an empty loading shell
 * and no HTTP redirect, so crawlers, link previews and text-only views of the
 * URL saw a blank page. Resolving the URL here lets the route page redirect on
 * the server instead.
 */
export type RedirectSearchParams = Record<string, string | string[] | undefined>;

export function countryScopedUrl(path: string, searchParams?: RedirectSearchParams): string {
  const rawCountry = searchParams?.country;
  const country = (Array.isArray(rawCountry) ? rawCountry[0] : rawCountry)?.toLowerCase() || "us";
  return `/country/${country}/${path}`;
}
