---
date: 2026-11-25
title: "One set of text sizes across the game"
summary: >-
  Text now uses five sizes everywhere: 30 for page titles, 20 for section
  headings, 16 for subheadings, 14 for body text and 12 for small print. The
  smallest text in tables and labels is a little larger and easier to read.
tags: [ui, accessibility]
badges: [patch]
areas: [frontend]
---

The game used two overlapping sets of text sizes plus dozens of one-off sizes
between 8 and 64 pixels. Every page now uses the same five steps: 30, 20, 16,
14 and 12 pixels.

The smallest labels, which were as small as 8 to 11 pixels, now start at 12,
so dense tables and badges are easier to read. Very large display text tops out
at 30. Third-level headings are 16 pixels on every page. Chart labels drawn
inside graphics keep their own sizes, since they scale with the chart.
