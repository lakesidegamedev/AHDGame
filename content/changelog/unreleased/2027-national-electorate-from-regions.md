---
date: 2026-11-09
title: "National contests count every region's census groups"
summary: >-
  Contests decided across the whole country, such as a list tier or a direct
  national vote, now count the same census groups as the regional contests,
  weighted by each region's voters.
tags: [elections, demographics]
badges: [patch]
areas: [backend]
---

## What changed

- A nationwide contest builds its electorate from every region's census groups, weighted by how many eligible voters each region has, instead of a stored national summary.
- Regional ad buys still reach only the voters in the region they target, and now do so group by group within a national contest.
- A nationwide contest in a country with a region missing census data now reports an error instead of quietly using a stored summary.
