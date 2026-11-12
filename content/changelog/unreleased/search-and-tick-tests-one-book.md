---
date: 2026-11-11
title: Search and policy effect tests follow the one law book, with no player-visible change
summary: >-
  The legislation search and policy tick tests used US and UK law types the
  one law book replaced. They now use laws that still exist. Nothing in a
  running game changes.
tags: [maintenance, legislation]
badges: [patch]
areas: [backend]
---

## What changed

- Legislation search tests use the Japanese and French banking charter acts
  and a modern Japanese law for the era check.
- The policy tick test checks that a national law's effect is shared across
  its own country's regions, using a test law.
