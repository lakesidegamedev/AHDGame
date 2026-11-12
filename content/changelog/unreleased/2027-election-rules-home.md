---
date: 2026-11-08
title: "Election vote rules now live in one folder"
summary: >-
  The portable election rules (ranked-choice counting, spoiler transfers, seat
  eligibility, tenure retention and others) moved into one folder. Results are
  unchanged.
tags: [engine, elections]
badges: [patch]
areas: [engine]
---

## What changed

- The election rule modules that were split across three folders now sit together, so a fix to how votes are counted has one place to look.
- Old import paths still work and point at the moved files. Nothing changes for players.
- A new check stops fresh election code from being added to the old folders.
