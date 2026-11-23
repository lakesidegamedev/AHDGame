---
date: 2026-11-23
title: "Government approval follows the responsible government"
summary: >-
  National debt and deficits affect national approval, while regional borrowing
  affects only that region. Approval also recognizes broad improvements and
  stays consistent across pages, elections and interrupted turns.
tags: [politics, government, budgets, elections]
badges: [patch]
areas: [fullstack]
---

## What changed

- National and regional fiscal approval effects are separated. A region's debt,
  deficit and governor address do not enter national approval or another region's rating.
- Metrics v2 measures performance against frozen opening references, so improving
  every region can improve approval throughout the country.
- Crisis and decision approval changes survive later snapshots, with matching
  approval, disapproval and net totals.
- Pages, maps, rankings and election calculations use the recorded regional rating.
- Interrupted approval snapshots resume without repeating smoothing, history or
  war exhaustion. Canadian provincial majorities also receive their responsibility share.
- Approval breakdowns retain the true regional performance figure at the floor or ceiling.
