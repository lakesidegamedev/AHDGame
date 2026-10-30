---
date: 2026-10-30
title: Company screens count plants, not capacity units
summary: >-
  Every company table now leads with the plants you own and the plants being
  built, and shows one clear reading of how they did: how much of what they
  could make they ran, and how much of what they made sold.
tags: [economy, corporations]
badges: [patch]
areas: [fullstack]
---

- The company overview, sectors table, CEO office, national company panel,
  bulk build window, state market page and the expand market window now count
  plants. The raw output figure is still there when you hover.
- The old "45% / 55% used" pair is now labelled: "Running 55%" is the share of
  what your plants could make that they made, and "Sold 45%" is the share of
  what they made that found buyers.
- Room to build is shown as about how many new plants buyers would keep busy.
- A sector with no plants yet reads "No plants yet" and "Not running yet". It
  no longer shows a starting crew of workers or a starting revenue it never
  earned.
- A plant that sold nothing in a turn now shows its real loss. Before, the
  company page dropped its running costs and showed the stock it made as
  profit.
