/**
 * The "top 35" page cohort for the Lighthouse scorecard: every sitemap URL at
 * priority >= 0.7 plus the main anonymous navigation surfaces, using canonical
 * redirect targets. A deterministic proxy, since no per-page traffic export is
 * available locally. Keep it in sync with `src/app/sitemap.ts` and the README.
 *
 * `seo: false` marks pages that are deliberately not indexable, where the
 * `is-crawlable` audit fails by design; their SEO score is reported but kept
 * out of budgets and averages. `/news` is noindex while it has no public posts.
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

/**
 * Signed-in cohort: pages a player opens while playing, measured with a session
 * cookie for the benchmark account. `:corp` and `:party` placeholders are
 * filled from `--corp=<id>` and `--party=<id>` (the run script looks them up
 * in the benchmark world when omitted). `seo` is always false: these pages are
 * behind a login and not indexable.
 */
export const SIGNED_IN_PAGES = [
  { path: "/dashboard", name: "si-dashboard", group: "signed-in" },
  { path: "/profile", name: "si-profile", group: "signed-in" },
  { path: "/actions", name: "si-actions", group: "signed-in" },
  { path: "/portfolio", name: "si-portfolio", group: "signed-in" },
  { path: "/notifications", name: "si-notifications", group: "signed-in" },
  { path: "/country/us", name: "si-country", group: "signed-in" },
  { path: "/country/us/economy", name: "si-country-economy", group: "signed-in" },
  { path: "/country/us/legislature", name: "si-legislature", group: "signed-in" },
  { path: "/country/us/budget", name: "si-country-budget", group: "signed-in" },
  { path: "/country/us/parties", name: "si-country-parties", group: "signed-in" },
  { path: "/parties/:party", name: "si-party", group: "signed-in" },
  { path: "/elections", name: "si-elections", group: "signed-in" },
  { path: "/campaign", name: "si-campaign", group: "signed-in" },
  { path: "/budget", name: "si-budget", group: "signed-in" },
  { path: "/corporation/:corp", name: "si-corporation", group: "signed-in" },
  { path: "/corporations", name: "si-corporations", group: "signed-in" },
  { path: "/market", name: "si-market", group: "signed-in" },
  { path: "/stockmarket/us", name: "si-stockmarket", group: "signed-in" },
  { path: "/news", name: "si-news", group: "signed-in" },
  { path: "/map", name: "si-map", group: "signed-in" },
  { path: "/world", name: "si-world", group: "signed-in" },
  { path: "/banking", name: "si-banking", group: "signed-in" },
].map((page) => ({ ...page, seo: false, signedIn: true }));
