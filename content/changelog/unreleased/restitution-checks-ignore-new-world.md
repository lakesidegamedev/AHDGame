---
date: 2026-11-13
title: "Old-world restitution checks no longer flag a fresh world"
summary: >-
  Two repair checks for money owed after past-world bugs reported pending work
  on the new world's own bank and state corporation. They now skip anything the
  current world created, so they cannot credit it by mistake.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The Vermont Finance bank restitution check ignores a central bank created by the current world.
- The freight overbilling restitution check ignores corporations created by the current world.
- Records from an earlier world are still found.
