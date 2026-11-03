---
date: 2026-11-03
title: Cheaper goods find more buyers
summary: >-
  With demand curves switched on, households buy more of a good when it gets
  cheaper, within the same budget, so building into a short market can sell
  more by pricing lower. Richer regions lean toward discretionary goods, and
  households save more when interest rates are high.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, market, balance]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [major]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- A household used to place one order per good at one price limit and buy a
  fixed number of units. When a seller asked less, the household bought the
  same amount and kept the change, so more supply could never sell more.
- Behind a new switch, off until it is turned on, each good's order becomes a
  short ladder: the old order stays on top, and lower prices add the extra
  units a household would buy at that price. Every step of a good shares the
  same budget, so cheaper prices buy more with the same money and never spend
  more than before. Essentials such as food and energy barely react;
  vehicles, electronics and consulting react strongly.
- The same switch shifts spending with income: richer regions put more of
  their budget into discretionary goods and less into essentials. Households
  also save more of their cash when interest rates are high and spend more when
  they are low.
- A lower step that does not buy is not counted as demand, so it never makes a
  good look shorter than it is.
