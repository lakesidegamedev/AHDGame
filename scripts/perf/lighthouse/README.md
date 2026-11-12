# Lighthouse scorecard for the top-35 pages

The top-35 public pages have a repeatable Lighthouse scorecard. It exists so a
performance claim is a number in CI output, not a recollection of one browser
run.

## The cohort

`pages.mjs` is the single source of truth: 35 public,
anonymous, crawlable URLs — the sitemap's priority ≥ 0.7 routes (landing,
guides, world, news, changelog) plus the primary navigation surfaces (market,
politics, account). Legacy paths that only 308 are listed by their canonical
target so a redirect hop is not measured as page cost.

There is no per-page traffic export in the repository, so the list is a
deterministic proxy for "pages that matter most". When traffic data becomes
available, reorder the list rather than change its size.

Keep it in sync with `src/app/sitemap.ts`. If you add or remove a page, update
this file's baseline table in the same PR.

## Running it

```bash
# Against a local production build (no Cloudflare, no bot challenge):
npm run build
npm start -- -p 3000
CHROME_PATH=/path/to/chrome npm run perf:lighthouse:local

# Against production:
CHROME_PATH=/path/to/chrome npm run perf:lighthouse
```

Options (passed through to `run.mjs` after `--`):

| Flag            | Default                           | Meaning                                                |
| --------------- | --------------------------------- | ------------------------------------------------------ |
| `--base`        | `http://127.0.0.1:3000`           | Origin to audit                                        |
| `--strategy`    | `mobile`                          | `mobile` or `desktop` preset                           |
| `--pages`       | all 35                            | Comma-separated subset of paths                        |
| `--runs`        | `1`                               | Median across N runs                                   |
| `--out`         | `scripts/perf/lighthouse/results` | Report directory                                       |
| `--budget`      | `strict`                          | `strict` exits 1 on a floor breach; `off` reports only |
| `--chrome-path` | `$CHROME_PATH`                    | Chrome/Chromium binary                                 |

Reports are written per page (`<name>.json`), plus `summary.json` and
`summary.md`. The directory is gitignored.

`lighthouse` and `chrome-launcher` are devDependencies; a Chrome binary is not
bundled.

## Budgets

`scripts/perf/lighthouse/budgets.mjs` holds a `floor` (the regression gate) and
a `target` per category, plus metric ceilings in milliseconds (`CLS` is
unitless). Per-page overrides carry a reason string.

Only score floors gate the exit code. Metric ceilings are reported as warnings:
on a shared host, Total Blocking Time can double between two identical runs, so
gating it would fail on load rather than on a regression. Floors sit below the
measured baseline with headroom; raise them once a run on an idle host is
stable.

## Baseline

Measured 2026-11-11 on `release/1.20-2027`, desktop preset, local production
build, empty database (no player data, no seeded wiki). "Before" is base commit
`b0204df`, "after" is this branch, each built and served locally so Cloudflare's
bot challenge could not skew the numbers.

Median of three runs per page (single runs on this shared host vary too much in
Total Blocking Time to compare):

| Page        | Perf      | A11y      | Best practices | LCP          | TBT          |
| ----------- | --------- | --------- | -------------- | ------------ | ------------ |
| `/`         | 71→74     | 93→100    | 96→100         | 1778→904 ms  | 517→423 ms   |
| `/faq`      | 76→85     | 92→100    | 96→100         | 1578→834 ms  | 428→331 ms   |
| `/world`    | 72→82     | 92→100    | 74→78          | 2057→1029 ms | 418→278 ms   |
| `/sectors`  | 78→84     | 85→93     | 96→100         | 1584→925 ms  | 367→340 ms   |
| `/contact`  | 71→82     | 92→92     | 96→100         | 892→898 ms   | 896→390 ms   |
| `/login`    | 69→70     | 93→93     | 96→100         | 938→948 ms   | 1299→1124 ms |
| **Average** | **73→80** | **91→96** | **92→96**      |              |              |

A full 35-page sweep (one run each, same builds) moved the average perf score
from 63 to 75, accessibility from 91 to 95, best practices from 91 to 95, and
SEO from 90 to 97. Treat the sweep as a trend sample, not a gate: run-to-run
noise on a loaded host is ±10 performance points.

### What the audit found

- Google tags (gtag + Ads) were the largest single blocking source on every
  page: 600–750ms of long tasks, competing with hydration.
- The cookie-consent banner mounted only after the client store read
  `localStorage`. On anonymous loads it painted ~4s after FCP and became the
  Largest Contentful Paint element (measured on `/world` in production).
- `analytics.lakesidegames.net` no longer resolves, so the hardcoded umami tag
  failed on every page and logged a console error (a Best Practices failure).
- Party/coalition logo fallbacks redirected to `https://localhost:3000/...`
  behind the Railway proxy, so every entity without a custom logo rendered a
  broken image and logged a console error.
- `app/icon.png` and `app/apple-icon.png` were two identical 177KB PNGs loaded
  on every page.
- Anonymous visitors got an unnamed `/profile` link in the status bar, a navbar
  logo whose `alt` duplicated the wordmark, and several sub-4.5:1 text colours.

## Known follow-ups

- `/world` still records third-party cookies: party logos redirect to
  Wikimedia. Proxying those bytes through `/api/logos/*` would clear the
  Best Practices audit at the cost of Railway egress.
- `speed-index` on the landing page is still the weakest metric; the era globe
  and promotional media dominate first paint.
- The cohort is measured unauthenticated. Logged-in surfaces (dashboard,
  character pages) have their own cost profile and are covered by
  `scripts/perf/page-load/run.mjs`.
