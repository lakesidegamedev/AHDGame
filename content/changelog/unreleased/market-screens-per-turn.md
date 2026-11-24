---
date: 2026-11-24
title: "Market screens add up, per turn, with the background economy shown"
summary: >-
  Every market screen now shows who offered, ordered and received each good,
  including the background economy, imports and exports, in rows that add up to
  the totals, all per turn.
tags: [market, interface]
badges: [minor]
areas: [frontend]
---

The market screens mixed units and hid part of the market. World supply and
demand were daily figures (24 turns), company lists were model estimates on
their own scale, and the background economy's sales and purchases were inside
the totals without a row of their own, so nothing added up.

Now, on the commodity page, the market list, a country's card and the regional
breakdown:

- **One unit.** Every amount is per turn and says so. Marketing budgets, which
  are money per day, now say "per day (24 turns)".
- **Rows that add up.** Supply is split into companies, the background economy
  (sellers) and economy-only countries, plus imports. Demand is split into
  companies, households, governments, construction buyers, the background
  economy (buyers) and economy-only countries, plus exports. What buyers
  received is split the same way. Each set of rows adds up to its total.
- **Exact company lists.** Top producers and top consumers now show what each
  company offered and ordered on the market last turn, followed by every other
  seller or buyer and the total they add up to.
- **Regions add up to the country.** The regional breakdown adds a row for
  buyers and sellers not placed in a region, then the country total.
- **Your market share.** A company's output history now records what it offered
  on the market, per turn, so its share of world supply is measured in the same
  unit. Earlier estimates are marked and show no share.

Nothing about trading or prices changed.
