# Fertility policy ceiling comparison

## Decision

Select a positive ceiling of **+0.40 children per woman**, replacing +0.24. +0.32 improves Japan's path but still leaves annual growth negative at year 50 in the current-input sensitivity. +0.40 brings that arm slightly above zero while its current-policy effects on US and UK growth remain modest. This is game balance calibration, not an empirical estimate of real-world policy effects.

The maximum negative adjustment stays **-0.24**. The policy pressure cap stays +/-1.2, the per-turn adjustment stays 2% of the remaining index gap, and the absolute fertility bounds stay unchanged. Neutral pressure produces no boost. Delivery and funding eligibility remain authoritative. No country is activated or converted by this change.

The receipt timing correction is the separate parent commit `a31bacbe7e`. Every arm here uses the corrected receipt timing, so the ceiling comparison does not confound that fix with the balance change.

## Experiment and sources

Compared three ceilings (+0.24, +0.32, +0.40) under two pressure assumptions (current delivered pressure and sustained maximum positive pressure) for every supported v2 country: US, UK, JP, IE, SCO and WAL. Each arm advances 2,400 turns, or 50 game years at 48 turns/year. Paired arms share identical initial cohorts, mortality, migration and economic inputs.

US, UK and JP use aggregate turn-480 age/sex cohorts, current funded policy delivery, age-specific mortality receipts and observed national net migration. Source reads were outside a processing turn, with the turn checked again after collection. Snapshots and detailed machine outputs remain outside version control and contain no player identity or ownership information.

Ireland lacks current v2 cohort receipts in this world. Its run uses the existing regional cohorts with reviewed opening fertility/mortality calibration, neutral pressure and zero net migration. It is a calibration sensitivity, not a current-policy forecast. Scotland and Wales lack independent-country cohorts; they use their current UK territory vectors, inherited calibration and UK pressure, with zero international migration. They are not independence forecasts. Maximum-pressure arms for these three cases test the rule's supported-country range without assuming missing funded laws exist.

The harness reuses the production aging, fertility, mortality, migrant profile and conservative internal migration rules. International migration is a fixed national rate distributed by regional population. It does not rerun global admissions/caps, economic feedback, fiscal sustainability, housing, labour supply, wars or service withdrawals. Funding and health conditions are assumed sustained. Growth near zero is sensitive to these assumptions and is not guaranteed live growth.

## Current-input results

Annual population growth in year 50, percent:

| Country / sensitivity                |  +0.24 |  +0.32 |  +0.40 | Fixed net migration per year |
| ------------------------------------ | -----: | -----: | -----: | ---------------------------: |
| US, current inputs                   | +0.217 | +0.253 | +0.288 |                      +0.101% |
| UK, current inputs                   | +0.529 | +0.535 | +0.542 |                      +0.529% |
| JP, current inputs                   | -0.149 | -0.058 | +0.032 |                      +0.148% |
| IE, neutral-policy calibration       | +0.383 | +0.383 | +0.383 |                           0% |
| SCO, inherited territory sensitivity | -0.626 | -0.619 | -0.612 |                           0% |
| WAL, inherited territory sensitivity | -0.332 | -0.326 | -0.319 |                           0% |

Current funded pressure is +0.40 in the US, +0.07 in the UK, and +1.05 in Japan. At +0.40 ceiling these imply equilibrium boosts of about +0.133, +0.023 and +0.350 respectively, not an automatic +0.40 everywhere.

Japan's year-10 annual growth rises from +0.322% (old ceiling) to +0.372% (+0.32) or +0.421% (+0.40). Its 50-year population change is +3.08%, +6.26% and +9.52% respectively. At current pressure, its settled regional fertility ranges are 1.692-1.772, 1.762-1.842 and 1.832-1.912. Even the selected ceiling leaves these targets below the game's replacement anchor of 2.06.

## Maximum positive-pressure sensitivity

Annual population growth in year 50, percent, with +1.2 pressure held in every region:

| Country / sensitivity |  +0.24 |  +0.32 |  +0.40 |
| --------------------- | -----: | -----: | -----: |
| US                    | +0.427 | +0.528 | +0.628 |
| UK                    | +0.821 | +0.921 | +1.019 |
| JP                    | -0.110 | -0.007 | +0.095 |
| IE calibration        | +0.673 | +0.766 | +0.858 |
| SCO territory         | -0.291 | -0.177 | -0.065 |
| WAL territory         | -0.014 | +0.092 | +0.196 |

The selected ceiling adds roughly 0.18-0.21 percentage points of year-50 growth over the old ceiling in these maximum-pressure arms. It does not guarantee positive growth in all starting populations. The highest resulting year-50 growth is about 1.02%, in the UK arm that also assumes sustained 0.529% net immigration. This experiment found bounded growth over 50 years, not proof against every possible long-run feedback.

## Reproduction and validation

Run from this worktree with an external six-country input file whose per-country `input` matches `demographicReceiptInputSchema`:

```powershell
npx tsx scripts/sim/fertilityCeilingComparison.ts <external-input.json> <external-results.json> 50
```

The comparison explicitly sets each candidate ceiling, so changing the production default does not invalidate the paired arms. The script rejects missing/duplicate countries, inconsistent source turns, invalid vectors and invalid mortality. Tests verify neutral funding invariance, candidate ordering, bounded positive effects, unchanged negative effects, expiry, gradual response and source immutability. The balance change adds no turn reads or writes and changes no persisted schema or country readiness gates.

Verification: 662 demographic, funding and simulation tests passed with two existing skips; all 178 architecture contracts passed. TypeScript, changed-file lint and formatting passed, and the architecture audit reported zero blocking findings. The full repository test suite and Next production build were not run for this balance-only change.
