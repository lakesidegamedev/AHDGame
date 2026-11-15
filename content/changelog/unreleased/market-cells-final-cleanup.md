---
date: 2026-11-15
title: Stored market sizes are gone from the code and the freight map
summary: >-
  The last pieces of the old stored "unowned market" are removed. Nothing in the
  game reads or writes it, and the freight map no longer shows an open-market tint.
tags: [economy, corporations, map]
badges: [minor]
areas: [backend, frontend]
---

## What changed

- The stored unowned market collection, its types and its helpers are deleted. A
  world that still carries the old collection has it dropped during reset.
- The state economy board reads its room to build from the unmet demand of the
  goods market, under a renamed field.
- The freight map no longer tints a state as an open market. Its colour comes
  from freight capacity and haul load only.
- Starting size for state enterprises in planned economies still scales with
  regional output, and nothing limits them afterward.
