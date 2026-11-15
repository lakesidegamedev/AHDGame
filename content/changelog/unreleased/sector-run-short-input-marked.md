---
date: 2026-11-09
title: "Short inputs are marked on the sector page"
summary: >-
  When part of a sector's run stops for lack of an input, the Inputs list now
  marks the input that ran short and links to the companies selling it.
tags: [economy, corporations]
badges: [patch]
areas: [frontend]
---

## What changed

- Each input that ran short is marked "Ran short" in the "What goes in, what comes out" panel.
- Every marked input carries a link to the sellers offering it, not just the costliest input.
- If the run stopped on inputs but no input is short on the world market, the panel now says so instead of staying silent.
