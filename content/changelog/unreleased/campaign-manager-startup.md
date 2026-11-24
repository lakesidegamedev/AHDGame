---
date: 2026-11-24
title: "Campaign Manager holds its layout while opening"
summary: >-
  The phone tabs appear in their final position from the first render.
  Campaign Manager also loads the editor tools when they are available for the selected race.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The phone tabs and page spacing follow the viewport as soon as the page renders.
- A single loading area stands in for the map while the race list loads.
- Race editor tools load when the selected race supports editing for the viewer.
