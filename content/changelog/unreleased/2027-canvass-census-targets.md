---
date: 2026-11-09
title: "Canvassing and turnout targets use census groups only"
summary: >-
  Canvassing, party get-out-the-vote and voter suppression now aim at the same
  census groups the elections count, in every country.
tags: [elections, campaigns, demographics]
badges: [fix]
areas: [frontend, backend]
---

## What changed

- The canvassing panel and the party turnout pickers list the census groups of the region you are in (age, education, income and so on). The old per-country voter groups and the US ideology groups are gone.
- Outside the US, picking an old voter group used to spend money without moving any votes. That can no longer happen.
- A party that had saved an old voter group as its target has the target cleared. Nothing was prepaid, so there is nothing to refund: the party just needs to pick a census group again.
- Races that started before the current campaign rules can still be canvassed, using census groups.
