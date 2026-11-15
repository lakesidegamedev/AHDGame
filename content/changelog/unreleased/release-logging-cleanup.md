---
date: 2026-11-11
title: Structured error logging in country turn phases, with no player-visible change
summary: >-
  Failures in the per-country election and bill steps, and in the tension
  event for a foreign nationalization, are now logged through the shared error
  logger. Nothing in a running game changes.
tags: [maintenance]
badges: [patch]
areas: [engine]
---

## What changed

- Country election and bill steps report a failing family through the shared
  logger, which also records it for error tracking, instead of a bare console
  line plus a separate capture.
- The foreign nationalization tension event logs its failure the same way.
- Screens that list US states import the list from the US country folder
  directly.
