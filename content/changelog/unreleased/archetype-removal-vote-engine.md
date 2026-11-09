---
date: 2026-11-09
title: "Elections count voters by census group only"
summary: >-
  Get-out-the-vote effects outside the United States now land on the census
  groups they target, and the median voter shown on an election page is read
  from the same census electorate the vote is counted on.
tags: [elections, turnout, demographics]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Turnout boosts and suppression outside the United States now move the census groups they target (income, age, region and so on), as they already did in the United States. The old whole-state adjustment based on legacy voter groups is gone.
- The median voter on a general election page, including the electoral-vote weighted national median for a presidential race, is now computed from the census electorate that counts the votes.
- No setting or action changes. Worlds that never used the old voter-group turnout targets see no difference.
