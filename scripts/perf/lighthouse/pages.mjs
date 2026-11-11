/**
 * The "top 35" page cohort for the Lighthouse scorecard.
 *
 * There is no per-page traffic export available to a local checkout, so the
 * cohort is a deterministic proxy for the pages that matter most:
 *
 *   1. every URL the sitemap marks priority >= 0.7 (landing, guides, world,
 *      news, changelog), and
 *   2. the primary anonymous navigation surfaces (account, market, politics,
 *      world tools), using the canonical redirect targets where a legacy path
 *      just 308s.
 *
 * Keep this list in sync with `src/app/sitemap.ts`. If you add or remove a
 * page, re-run the audit and update `scripts/perf/lighthouse/README.md`.
 *
 * `seo: false` marks pages that are deliberately not indexable (robots.txt
 * disallow, or a page-level noindex for account and per-country surfaces).
 * Lighthouse's `is-crawlable` audit fails on them by design, so their SEO score
 * is reported but excluded from budgets and averages. `/news` is marked here
 * because it renders noindex while the database has no public posts; a run
 * against seeded data can drop that flag.
 */
export const TOP_PAGES = [
  { path: "/", name: "landing", group: "marketing" },
  { path: "/about", name: "about", group: "marketing" },
  { path: "/faq", name: "faq", group: "marketing" },
  { path: "/guides", name: "guides", group: "guides" },
  { path: "/guides/bonds", name: "guides-bonds", group: "guides" },
  { path: "/guides/commodities", name: "guides-commodities", group: "guides" },
  { path: "/guides/corporations", name: "guides-corporations", group: "guides" },
  { path: "/guides/forex", name: "guides-forex", group: "guides" },
  { path: "/guides/investing", name: "guides-investing", group: "guides" },
  { path: "/guides/planned-economies", name: "guides-planned-economies", group: "guides" },
  { path: "/guides/running-for-office", name: "guides-running-for-office", group: "guides" },
  { path: "/guides/running-for-office/us", name: "guides-running-us", group: "guides" },
  { path: "/guides/running-for-office/intl", name: "guides-running-intl", group: "guides" },
  { path: "/guides/api-automation", name: "guides-api-automation", group: "guides" },
  { path: "/changelog", name: "changelog", group: "content" },
  { path: "/news", name: "news", group: "content", seo: false },
  { path: "/world", name: "world", group: "game" },
  { path: "/wiki", name: "wiki", group: "content" },
  { path: "/market", name: "market", group: "game" },
  { path: "/sectors", name: "sectors", group: "game" },
  { path: "/corporations", name: "corporations", group: "game" },
  { path: "/country/us/politicians", name: "us-politicians", group: "game", seo: false },
  { path: "/country/us/parties", name: "us-parties", group: "game", seo: false },
  { path: "/elections", name: "elections", group: "game" },
  { path: "/country/us/legislature", name: "us-legislature", group: "game", seo: false },
  { path: "/country/us/executive", name: "us-executive", group: "game", seo: false },
  { path: "/dashboard", name: "dashboard", group: "game", seo: false },
  { path: "/login", name: "login", group: "account", seo: false },
  { path: "/register", name: "register", group: "account", seo: false },
  { path: "/create-character", name: "create-character", group: "account" },
  { path: "/search", name: "search", group: "game", seo: false },
  { path: "/tutorial", name: "tutorial", group: "game" },
  { path: "/supporters", name: "supporters", group: "marketing" },
  { path: "/contact", name: "contact", group: "legal" },
  { path: "/privacy", name: "privacy", group: "legal" },
];

export const TOP_PAGE_COUNT = TOP_PAGES.length;

if (TOP_PAGE_COUNT !== 35) {
  throw new Error(`pages.mjs must list exactly 35 pages, found ${TOP_PAGE_COUNT}`);
}
