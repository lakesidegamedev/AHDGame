---
date: 2026-11-09
title: "Guard against new voter archetype code"
summary: >-
  A repository check now fails when new code reintroduces voter archetypes.
  Voters are described by census groups only. No change to the game itself.
tags: [tooling, demographics]
badges: [patch]
areas: [backend]
---

## What changed

- A new architecture check counts mentions of voter archetypes in the source and fails if a file gains any. Estate, infrastructure, military, CEO, career and governing archetypes are exempt because they are not voter groups.
