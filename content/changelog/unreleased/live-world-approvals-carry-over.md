---
date: 2026-11-11
title: "Voter group approval records carry over to the new release"
summary: >-
  Politicians keep the approval they have built with each voter group when the
  server updates. Before this fix, the update would have read every record as
  empty.
tags: [politics, elections]
badges: [patch]
areas: [backend]
---

## What changed

- The approval each politician has earned with voter groups moves to its new place automatically when the server starts.
- Anything recorded in the first moments after the update is added to the old total, so nothing is lost either way.
- Elections and polls keep using each politician's full record.
