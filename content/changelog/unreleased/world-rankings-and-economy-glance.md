---
date: 2026-11-11
title: Rank nations by any statistic, and six economic graphs on a country overview
summary: >-
  The world page now has a ranking that orders every nation on any national
  statistic, with a comparison of two or three nations across a whole category.
  A country overview also opens with its growth, inflation, policy rate,
  unemployment, budget balance and debt, each with its recent direction.
tags: [world, economy]
badges: [minor]
areas: [frontend]
---

## World rankings

- New page at `/world/rankings`, linked from the world page. One statistic at a
  time: the overall score, a category score, or any single national metric.
  Ranks come from the metric's score, so a statistic that is better low ranks a
  strong result first, and nations with no scored figure are listed unranked
  instead of being treated as zero.
- Every nation with regions is ranked, including those with no stored national
  metrics document: their regions are rolled up with the same weighting the
  national phase uses.
- Pick two or three nations and compare them across every statistic in a
  category. Each figure carries its world rank, not just its value.
- The world page's nation table now shows the world rank beside the figure when
  the map is filtered to a metric, a category or the overall score.
- The globe has a compare mode: switch it on, click two nations, and their
  scores and every figure in a category sit side by side, each with its world
  rank and the stronger side of the row marked.

## Economy at a glance

- The country overview now shows GDP growth, inflation against its target, the
  policy rate against its neutral rate, unemployment, budget balance and debt to
  GDP, each with a small chart of its recent path where the series exists.
- Read from the same economy payload as the economy page, so the two cannot
  disagree, and it adds no turn work.

Both surfaces read figures the world already stores. No formula, budget, election
or turn phase changed.
