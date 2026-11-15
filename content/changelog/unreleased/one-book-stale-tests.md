---
date: 2026-11-11
title: Tests follow the one law book, with no player-visible change
summary: >-
  Three test files still checked US law types the one law book replaced. They
  now test what the game does today. Nothing in a running game changes.
tags: [maintenance, legislation]
badges: [patch]
areas: [engine]
---

## What changed

- The budget seed test checks that the US and UK get their enacted laws from
  the one law book, and that the remaining countries still get categorised
  legacy laws.
- The immigration population test checks the population engine directly
  rather than a retired law type.
- Checks on the retired gun control and border enforcement law wiring were
  removed with those law types.
