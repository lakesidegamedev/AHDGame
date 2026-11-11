/**
 * Score and metric budgets for the top-35 Lighthouse cohort.
 *
 * `floor` is the gate: a page may not regress below it. `target` is the number
 * we are working toward (the scorecard prints the gap, it does not fail on it).
 *
 * Floors are set from the measured baseline with headroom, because Lighthouse
 * on this box shares the CPU with everything else the host runs: Total Blocking
 * Time in particular can double between two otherwise identical runs, and the
 * performance score follows it. The stable categories (accessibility, best
 * practices, SEO) get tight floors; performance gets a catastrophic-regression
 * floor only.
 *
 * Metric ceilings are reported in the summary, not gated, for the same reason.
 */
export const SCORE_BUDGETS = {
  mobile: {
    floor: { performance: 0.4, accessibility: 0.9, "best-practices": 0.7, seo: 0.9 },
    target: { performance: 0.9, accessibility: 1, "best-practices": 1, seo: 1 },
  },
  desktop: {
    floor: { performance: 0.4, accessibility: 0.9, "best-practices": 0.7, seo: 0.9 },
    target: { performance: 0.9, accessibility: 1, "best-practices": 1, seo: 1 },
  },
};

/** Reported against each page's metrics; a miss is a warning, not a failure. */
export const METRIC_BUDGETS = {
  mobile: {
    "first-contentful-paint": 2500,
    "largest-contentful-paint": 3000,
    "total-blocking-time": 1200,
    "cumulative-layout-shift": 0.1,
    "server-response-time": 1500,
  },
  desktop: {
    "first-contentful-paint": 2000,
    "largest-contentful-paint": 2500,
    "total-blocking-time": 1000,
    "cumulative-layout-shift": 0.1,
    "server-response-time": 1000,
  },
};

/**
 * Pages whose budgets are deliberately different, with the reason recorded.
 * `best-practices` is capped on pages that load Wikimedia artwork: the image
 * hosts set a third-party cookie, which fails the audit until those images are
 * proxied through our origin (see scripts/perf/lighthouse/README.md, known follow-ups).
 */
export const PAGE_BUDGET_OVERRIDES = {
  "/": {
    reason: "Landing ships the era globe and promotional media above the fold.",
    target: { performance: 0.85 },
  },
  "/world": {
    reason: "World map is a canvas/SVG surface; LCP is bounded by first map paint.",
    floor: { performance: 0.35 },
  },
  "/guides": {
    reason: "Index grid of long-form guide copy; text LCP, image-free.",
  },
  "/changelog": {
    reason: "Post imagery is Wikimedia-hosted; third-party cookies cap best practices.",
    floor: { "best-practices": 0.6 },
  },
  "/news": {
    reason: "Player-written posts embed Wikimedia imagery; third-party cookies.",
    floor: { "best-practices": 0.6 },
  },
  "/country/us/legislature": {
    reason: "Wikimedia seal artwork and async chamber data; LCP and CLS are data-bound.",
    floor: { performance: 0.2, "best-practices": 0.6 },
  },
  "/country/us/executive": {
    reason: "Wikimedia White House photography and async data.",
    floor: { performance: 0.3, "best-practices": 0.6 },
  },
  "/country/us/politicians": {
    reason: "Portrait imagery is Wikimedia-hosted.",
    floor: { "best-practices": 0.6 },
  },
  "/country/us/parties": {
    reason: "Party logos redirect to Wikimedia artwork; third-party cookies.",
    floor: { "best-practices": 0.6 },
  },
  "/elections": {
    reason: "Map artwork and async fixtures; Wikimedia cookies.",
    floor: { performance: 0.3, "best-practices": 0.6 },
  },
  "/create-character": {
    reason: "Portrait picker loads many remote images; TBT is picker-bound.",
    floor: { performance: 0.3 },
  },
  "/corporations": {
    reason: "Corporation logos are remote artwork.",
    floor: { "best-practices": 0.6 },
  },
  "/privacy": {
    reason: "Long legal copy; single-run TBT is host-noise-bound.",
    floor: { performance: 0.3 },
  },
};

export const METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "server-response-time",
];
