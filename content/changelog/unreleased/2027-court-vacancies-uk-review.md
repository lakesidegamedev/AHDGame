---
date: 2026-11-09
title: "Supreme Court vacancies fill without a player President"
summary: >-
  Empty Supreme Court seats now get a nomination and a Senate vote when the
  presidency is held by a computer-run politician or is vacant, and UK judicial
  review rulings now follow the governing party and only run where the UK exists.
tags: [scotus, uk, government]
badges: [patch]
areas: [engine, backend]
---

## What changed

- When a Supreme Court justice dies or retires and no player is President, the sitting President (or, with no President, the largest Senate party) now nominates a replacement and the Senate votes on it. Before, those seats stayed empty for good and the Court kept shrinking.
- One nomination is filed per turn, and a seat whose nominee was just turned down waits two game days before the next try.
- UK judicial review rulings now lean with the party actually in government, so they enact the matching law instead of always ending in a split ruling that changed nothing.
- UK judicial review no longer runs in worlds where the UK is not part of the full simulation.
