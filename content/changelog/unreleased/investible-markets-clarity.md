---
date: 2026-10-27
title: Expansion screen shows which markets you can enter now
summary: >-
  The new-sector picker now splits markets into "Can enter now" and "Not
  available now" with the reason, and shows room to build with the same
  figure as the state market page instead of old unclaimed revenue.
tags: [corporations, expansion, plants]
badges: [patch]
areas: [fullstack]
---

## What changed

- The market list on the "Build a new sector" screen is grouped into "Can
  enter now" and "Not available now". A market you cannot enter names why:
  not enough cash, Retail paused, state-run market, corporation actions
  paused, or player control needed. The build button stays off for those
  markets and the review step shows the full reason.
- The list, footer and review card label their number "Room to build", in
  units per day. It is the same figure the state market page shows. Lanes
  whose buyers are shared across a country say so.
- If a market still carries a small pool of old unowned revenue, the review
  card names it "Unclaimed legacy revenue" and notes that entry is sized by
  room to build, not that pool.
- The state market page shows "Room to build" in place of the unowned
  revenue figure, which always read zero once markets moved to plants. For
  lanes shared across a country it now subtracts plants under construction
  anywhere in that country, matching the expansion screen.
- The sector browser labels unowned revenue as "unclaimed legacy revenue" and
  says the market is entered by building a plant.
- Founding a sector outside your primary type now uses the same research
  discounts as every later build in that sector, so the quoted price and the
  charged price agree.
