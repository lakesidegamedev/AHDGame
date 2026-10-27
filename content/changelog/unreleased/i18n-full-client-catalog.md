---
date: 2026-10-27
title: Fixed raw text codes showing in place of labels
summary: >-
  Some screens, including the build capacity dialog, showed internal text codes
  such as corporations.sectorInvestment.buildTotal instead of their labels.
  Every page now receives its full set of labels again.
tags: [ui, localization]
badges: [patch]
areas: [frontend]
---

## What changed

- Pages send the full label catalog to the browser again, as before 1.19. The
  per-page trimming added for speed left some screens without the labels they
  render, so players saw raw codes. Staff accounts were never trimmed, which is
  why it did not show for them.

Pages carry somewhat more text data than under 1.19 until the trimming returns
with a check that covers every screen.
