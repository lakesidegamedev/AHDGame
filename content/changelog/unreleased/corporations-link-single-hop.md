---
date: 2026-11-17
title: The old corporations link opens the market in one hop
summary: >-
  Old bookmarks and guide links to the corporations page now go straight to the
  stocks tab of the market hub instead of bouncing through a retired URL.
tags: [market, navigation]
badges: [patch]
areas: [frontend]
---

## What changed

- `/corporations` answers with a single redirect to the stocks tab of the
  market hub. It previously redirected to the old country stock market URL,
  which then redirected again, so the page paid for a full server render just
  to pass the player on.
- The page route keeps the same destination as a fallback for any request that
  reaches it directly.
- Query strings are not carried over, as before.
