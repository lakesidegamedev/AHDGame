---
date: 2026-11-23
title: Experimental page decode now hides the page while it loads
summary: >-
  With experimental features on, a page no longer jumps around while its panels
  load and then blanks out for the decode. It shows a glyph shimmer while the
  page assembles and decodes once, as soon as the page holds still.
tags: [interface]
badges: [patch]
areas: [frontend]
---

- In-app navigation shows a glyph shimmer in place of the page while its
  skeleton, data and late panels arrive, so none of those swaps are visible.
- The decode starts once the page has stopped changing for a moment, and never
  more than 2.5 seconds after the page opened, however busy it is.
- The decode itself is shorter, about a third of a second.
- A page that arrives complete on a fresh load is shown straight away instead of
  being hidden and replayed.
- Only players with experimental features switched on see any of this.
