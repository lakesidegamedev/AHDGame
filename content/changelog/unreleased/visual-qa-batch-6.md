---
date: 2026-11-24
title: Loading label, wrapped company labels and a fuller elections bar
summary: >-
  Pages say they are loading, company labels wrap instead of cutting off, the sectors table
  shows a scroll cue reliably, and the elections stats fill their bar.
tags: [interface, corporations, elections]
badges: [patch]
areas: [frontend]
---

## What changed

- While a page loads, a small "Loading" label appears at the top of the screen next to the progress bar.
- Labels in company figure lists wrap onto a second line instead of cutting off; the figures beside them stay whole.
- The company sectors table is narrower on standard desktop screens, and when it still scrolls sideways the arrow cue appears as soon as the table loads.
- The elections stats spread across the full width of their bar.
