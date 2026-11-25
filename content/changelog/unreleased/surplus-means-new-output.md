---
date: 2026-11-25
title: "Surpluses count new output, and the background economy buys from oversupplied goods"
summary: >-
  Market screens now show unsold stock from earlier turns apart from what
  plants made this turn, and only call a good in surplus when new output
  exceeds orders. When a good's new output keeps going unsold, the background
  economy buys more of it.
tags: [market, economy]
badges: [minor]
areas: [fullstack]
---

Plants offer their unsold stock again every turn, and the market counted it as
supply each time. A good whose plants sold nearly everything they made could
still read as deeply oversupplied because old stock kept being offered.

- **Old stock on its own line.** Supply now splits player and AI companies
  into what they made this turn and unsold stock from earlier turns. The rows
  still add up to the total, and the supply and demand panel says how much of
  the supply is old stock.
- **Surplus means new output.** The market list calls a good in surplus only
  when this turn's output exceeds what buyers ordered. A good whose only extra
  is old stock reads "Old stock left".
- **The background economy buys more of an oversupplied good.** When more
  than 15% of a good's new output goes unsold three turns running, the
  background economy's buyer grows to take some of it, up to a quarter of
  demand, paying no more than the reference price and only after every real
  buyer. It shrinks back as real demand catches up. Old stock alone never
  triggers it.
