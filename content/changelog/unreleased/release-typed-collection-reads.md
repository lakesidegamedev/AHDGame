---
date: 2026-11-11
title: Typed database reads for basing, region transfers and wealth, with no player-visible change
summary: >-
  Three database reads added during 1.20 now go through the shared typed
  collection handles. Nothing in a running game changes.
tags: [maintenance]
badges: [patch]
areas: [engine]
---

## What changed

- The basing agreement index migration, the region transfer step that finds
  incoming companies and the net worth count of company-held stakes now read
  through the typed collection handles the rest of the code uses.
- No query or result changed.
