---
date: 2026-11-23
title: "The expand dialog explains its numbers"
summary: >-
  The expand dialog now says why profit and payback are missing, shows the
  recommended count or why there is none, and warns about freight and staffing.
tags: [corporations, build]
badges: [patch]
areas: [ui]
---

## What changed

- When the expand dialog has no profit or payback figure, it says why (no plants yet, nothing made last turn, or plants mothballed) and when it will appear.
- When no unmet demand is measured for a sector's output, the dialog notes that extra capacity is modelled with only its running cost. Sectors of the same type can show the same figure for that reason.
- A line beside Match demand shows the recommended count, or the plain reason there is none.
- The model estimate of room to build is now labelled as an estimate, not measured buyers and not a recommendation.
- The dialog warns when freight in the state is at its limit, so out-of-state sales will not ship.
- Worker shortage notes now point to the wage level on the People tab.
- The dialog's payback is labelled as payback on this order, and the sector header's break even is labelled as being for builds already under way.
