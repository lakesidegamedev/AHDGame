---
date: 2026-11-23
title: Clearer product development targets and supply agreement prices
summary: >-
  Product development forms now show each line's target, and supply agreement forms state which price they settle against.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, supply agreements]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend, backend]
---

## What changed

- Product development shows the target each spend level is measured against, what revenue it is based on, and each level's spend as a share of the target. The form now says that every line uses the same quality curve, so lines that lift the same plants show the same numbers.
- The supply agreement form names the billed input price that contracts settle against, shows the market price from the commodities table next to it, and shows the slider range in money. The two prices differ because the billed price follows the market in a damped, bounded way.
- Supply agreement volumes and commitments are shown per day everywhere, and the damage ceiling is explained in plain words.
- Selling shares now shows the cost basis of the shares sold, the gain, and the rate applied to short-term and long-term gain, so the tax withheld equals the gain times the rate on screen.
- Technologies whose only effect is an input reduction that is already at the 30% cap can no longer be bought. The Unlock button is disabled with the reason, and the server refuses the purchase. When only part of an input reduction still fits under the cap, the card says how much.
- The technology price note now gives both minimums: the full minimum for technologies with no running benefit, and one tenth of it for technologies that save running costs.
- The supply offers board lists offers your plants can use first and moves offers you cannot use into a collapsed "Offers you cannot use" group. Offers to buy more than your daily use of that input say "About Nx your daily use". Taking an offer now asks you to confirm, stating the volume per day and the term.
