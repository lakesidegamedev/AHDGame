---
date: 2026-10-19
title: Recompute demographic and household metric rollups
badges: [patch]
areas: [engine]
tags: [metrics, demographics, funding]
---

- National fertility and life expectancy now pool age-specific births, deaths and exposures instead of averaging regional lifetime measures. Population change uses the population before each turn.
- Calibrated mortality drives both actual cohort deaths and the published life table. Funded family-policy delivery affects the fertility input, including existing laws and later funding changes.
- Health coverage and delay estimates use owned outcomes rather than converted legacy political scores. Housing hardship, food insecurity, preventable mortality and public trust respond to linked conditions.
- National purchasing power and inequality combine modeled regional income distributions, including between-region income differences. These remain estimates, not household surveys or after-tax income statistics.
- New history samples retain their aggregation inputs. Existing history is not rewritten. Applies to all enabled v2 metric countries, including successor countries.
