---
date: 2026-10-22
title: The twenty slowest pages load faster
summary: >-
  Pages that felt like they hung — regional capitals, state legislatures, the
  world map, the cabinet office, the forex board, the OAuth sign-in hand-off —
  now do less work before they paint. A world-state read that used to be
  repeated is read once, seat queries that scanned every official in every
  country use an index, and several pages that waited on one round trip after
  another now ask for everything at once.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [performance]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend, frontend]
---

## What changed

- Regional pages (capital, governor's office, state legislature) ask for their data in one batch instead of a dozen consecutive round trips, and seat lookups use new indexes on `electedOfficials` by state and by chamber instead of scanning every official in the world.
- The world page loads its nation snapshots, entity map, blocs and legacy finances together, and stops re-reading the world preset once per country.
- The cabinet office ships only the tab you open instead of every department panel, and the briefing quotes defence suppliers against one quota document.
- The forex board fetches its wallet with the initial batch and loads monetary policy only when you open that tab.
- OAuth sign-in no longer waits up to 1.2 seconds on an advisory fingerprint, and no longer boots the error-reporting SDK on the callback page.
- The inbox reads the viewer's identity from the shell it already fetched instead of a second full session lookup, and its list, total and unread badge come from one pass.
- Legacy `/country/…/stockmarket` and `/world/legacy` links redirect before the app renders, charters pages resolve their independent lookups together, and the maintenance wall reuses the cached status the request already paid for.
