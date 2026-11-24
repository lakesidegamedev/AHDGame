---
date: 2026-11-24
title: "Market screens now show every amount per turn"
summary: >-
  Company output, world supply and demand, and country and state figures on the
  market screens now all use the same unit, per turn, and say so.
tags: [market, interface]
badges: [patch]
areas: [frontend]
---

The commodity pages showed company output per turn but world supply and demand
on a basis 24 times larger, and neither said which. A large company could look
like a tiny sliver of a world total that was really only a few times its size.

Every amount on the commodity page, the market list and a company's market share
panel is now per turn and labelled that way. A company's share of world supply
on its market share panel is now correct too. The world total also notes that it
includes imports and background sellers. Nothing about the market itself has
changed, only how the amounts are shown.
