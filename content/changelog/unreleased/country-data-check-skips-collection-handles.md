---
date: 2026-11-11
title: "Country data check skips database collection handles"
summary: >-
  The automated check that keeps each country's data in its own folder no
  longer mistakes database collection handles for country data. The game
  itself is unchanged.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- Database collection handles, which all live in one shared place by design, are no longer reported as UK data sitting outside the UK folder.
- Nothing changes for players.
