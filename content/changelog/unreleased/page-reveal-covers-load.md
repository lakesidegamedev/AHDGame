---
date: 2026-11-23
title: Pages stop jumping while they load
summary: >-
  The site footer no longer rises into the middle of the screen while a page
  loads and then drops away. With experimental features on, the page decode now
  covers the load with a glyph shimmer and plays once, as soon as the page holds
  still, instead of after the page has already jumped around.
tags: [interface]
badges: [patch]
areas: [frontend]
---

## Every player

- The page area keeps at least a screen of height while a page loads, so the
  footer and ad strip stay below the fold instead of flashing into view and
  being pushed back down. On the legislature page this removed nearly all of
  the movement during navigation.
- The navigation bar shown while your session loads is now the same height as
  the real one, so pages no longer shift by a few pixels on every load.
- On an election night the country elections page holds the results board's
  space while it loads, so the race list no longer drops by several hundred
  pixels when results arrive.
- A corporation's quote panel holds the share price sparkline's space while
  its history loads, so the header no longer grows after the page appears.
- The executive page shows the impeachment line straight away instead of
  inserting it above the approval chart once it has loaded.
- The market page reserves the stock chart's space from the first paint, so the
  tabs and listings no longer drop by a quarter of a screen when the chart
  arrives.

## Experimental page decode

- In-app navigation shows a glyph shimmer in place of the page while its
  skeleton, data and late panels arrive, so none of those swaps are visible.
- The decode starts once the page has stopped changing for a moment, and never
  more than 2.5 seconds after the page opened, however busy it is.
- The decode itself is shorter, about a third of a second.
- A page that arrives complete on a fresh load is shown straight away instead of
  being hidden and replayed.
- Only players with experimental features switched on see the decode.
