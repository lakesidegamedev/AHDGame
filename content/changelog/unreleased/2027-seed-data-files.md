---
date: 2026-11-08
title: "Starting data checked before a world is created"
summary: >-
  Two large starting data tables, background country political scores and
  voter group weights, are now stored as checked data files. Nothing changes in
  play.
tags: [world, engineering]
badges: [patch]
areas: [backend, engine]
---

## What changed

- The starting political scores for background countries and the weights that link voter groups to census groups now live in data files instead of program code.
- Both files are checked before a world is set up: every score must be between 0 and 100, every listed country must be present, and each voter group's weights must add up to one. A bad value now stops the setup with a clear message instead of reaching a world.
- The values themselves are unchanged, so existing worlds and new worlds play exactly as before.
