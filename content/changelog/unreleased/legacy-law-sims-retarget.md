---
date: 2026-11-11
title: Law effect simulations test laws that still exist, with no player-visible change
summary: >-
  The checks that a law moves its metrics over many turns used US and UK law
  types the one law book replaced. They now use Japan's equivalent laws.
  Nothing in a running game changes.
tags: [maintenance, legislation]
badges: [patch]
areas: [engine]
---

## What changed

- The economy, education, environment, healthcare, infrastructure, public
  safety, social and governance law simulations run on Japan's matching laws.
- The banking separation checks use Japan, since the US, UK, Russia and East
  Germany have no charter bill in the one law book.
- The birth rate lever check was removed: no law moves birth rate in the one
  law book.
