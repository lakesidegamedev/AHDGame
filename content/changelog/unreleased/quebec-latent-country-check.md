---
date: 2026-11-11
title: "Hidden country check covers Quebec"
summary: >-
  The automated check that keeps not-yet-formed countries out of country
  pickers now covers Quebec. The game itself is unchanged.
tags: [engineering, canada]
badges: [patch]
areas: [backend]
---

## What changed

- Quebec, which only exists as a country after it votes to leave Canada, is checked like Scotland and Wales: defined, but not offered in country lists until it forms.
- Nothing changes for players.
