---
date: 2026-11-03
title: Demand curves, steadier public buying and clearer market reasons
summary: >-
  Households can buy more when goods get cheaper, richer regions spend more on
  discretionary goods, public budgets no longer arrive in one burst, prices no
  longer pile up on one ceiling, and the sector page says why an output did not
  sell. Every economy change ships switched off, to be turned on in stages.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, market, corporations, balance]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [major]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine, fullstack]
---

## What changed

- **Demand curves** (off until switched on). A household used to place one
  order per good at one ceiling price and buy a fixed number of units, so a
  cheaper seller sold the same amount at a lower price. Each good's order is
  now a short ladder: the old order stays on top, and lower prices add the
  extra units a household would buy at that price. Essentials such as food and
  energy barely react; vehicles, electronics and consulting react strongly.
  Building into a short market now sells more by pricing lower.
- **Income and saving** (same switch). Richer regions put more of their
  spending into discretionary goods and less into essentials, and households
  save more when interest rates are high and spend more when they are low.
- **Steadier public buying** (off until switched on). A government budget line
  that sat short could spend several turns of saved budget the moment supply
  arrived, then drop back. It now draws at most half a turn of extra budget
  each turn, so a seller's revenue no longer jumps for a single turn.
- **Soft price ceiling** (off until switched on). Prices approach the ceiling
  gradually instead of stopping on it, so goods in different shortages stop
  showing the same pinned price.
- **Why it did not sell.** The sector page says why part of an output went
  unsold last turn: your price was above what buyers paid, every buyer at your
  price was already supplied, or nobody bought it at all.
- **Net production.** The company commodity table now says that a surplus is
  added up across every site and does not mean your own plants received it.
