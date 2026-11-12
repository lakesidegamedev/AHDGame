---
date: 2026-11-11
title: "Records addressed by name constants get shared front doors too"
summary: >-
  Behind the scenes, about 870 more reads and writes of federation, election
  system, advertising, repair-tool and other records now go through shared
  modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Everything behaves exactly as before. Database access for these record types now lives in one place each, and an automatic check stops new code from reaching around it.
