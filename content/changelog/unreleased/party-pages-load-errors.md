---
date: 2026-11-09
title: Party and coalition pages now tell you when something fails to load
summary: >-
  Several party hub, coalition and state party panels swallowed network failures
  and showed an empty or stale page. They now show a short error message.
tags: [parties, reliability]
badges: [patch]
areas: [frontend]
---

## What changed

- The party hub, coalition page, state party page, committee proposals list and the
  proposal form now show a message when data fails to load, instead of leaving the
  page blank with no explanation.
- Background progress polling and the reset console keep ignoring partial updates,
  with a note in the code explaining why.
- No game rules changed.
