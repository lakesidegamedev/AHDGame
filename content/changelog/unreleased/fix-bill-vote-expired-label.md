---
date: 2026-11-08
title: "Bill page no longer shows Expired on open votes"
summary: >-
  Chamber vote countdowns on the bill page now follow turns, so a vote that is
  still open no longer reads Expired when turns run late.
tags: [congress, interface]
badges: [patch]
areas: [frontend]
---

## What changed

- The second chamber vote, the floor vote and the top-of-page vote tile now show turns remaining, then Awaiting result once the closing turn arrives, the same as the nomination page.
- Before, they counted down a clock time and flipped to Expired in red even while the vote was still open.
