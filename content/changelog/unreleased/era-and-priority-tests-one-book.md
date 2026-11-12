---
date: 2026-11-11
title: Era, approval and priority tests follow the one law book, with no player-visible change
summary: >-
  Four more test files used US law types the one law book replaced. They now
  use laws that still exist. Nothing in a running game changes.
tags: [maintenance, legislation]
badges: [patch]
areas: [backend]
---

## What changed

- The law era window checks use Japanese laws with known unlock years.
- The approval direction check uses Japan's income tax and minimum wage laws,
  which have the same option layout as the retired US laws.
- The electorate priority editor test reads the same law list a seeded world
  holds, including the one law book.
