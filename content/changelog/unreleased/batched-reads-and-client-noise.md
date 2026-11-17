---
date: 2026-11-17
title: "Fewer database reads on world, achievements and senate leadership pages"
summary: >-
  The world page, a character's achievement list and the Senate leadership page
  now load their data in a handful of queries instead of one per country,
  achievement or leadership role. Crashes caused by browser page translators
  no longer reach the error tracker.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- World page seat tallies for parliamentary countries come from one query.
- Achievement progress counts are computed once per source instead of once per unearned achievement.
- Senate and House leadership elections are read in one query.
- Browser translator recursion errors are filtered from client error reports.
