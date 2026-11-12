---
date: 2026-11-08
title: "Crisis responses and aftermath fixes"
summary: >-
  Crisis responses now always appear on the site, leaders of other countries
  can see aid and shared contributions, and the political fallout of a crisis
  is no longer lost if something goes wrong while it is being applied.
tags: [crises, politics, foreign aid]
badges: [patch]
areas: [backend, engine]
---

## What changed

- The list of responses you can pull during a crisis could come back empty, and pulling a valid response could be refused, until the game server had run its own crisis turn. Responses now load on their own every time.
- Foreign aid and shared contributions to another country's crisis are now offered to eligible leaders of other countries, matching what the game already let them do when they acted.
- Approval changes and voting shifts that follow a crisis, and the strikes or bank runs it sets off, are now kept as owed until they are fully applied. If something fails partway, the next turn finishes the job without applying the same change twice.
