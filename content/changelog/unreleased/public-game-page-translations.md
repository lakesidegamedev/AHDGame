---
date: 2026-11-24
title: "Public game pages send less translation data"
summary: >-
  Visitors browsing public game pages download the translations those pages
  use. This reduces the amount of data needed to open those pages.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Public company, market, election, map, character, legislature, party and region pages send smaller translation downloads to signed-out visitors.
- German pages can load again with the missing government confidence translations in place.
