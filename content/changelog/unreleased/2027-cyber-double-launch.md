---
date: 2026-11-11
title: "A cyber operation sent twice at once is charged once"
summary: >-
  Two cyber launches sent against the same country at the same moment no
  longer both go through: the second is refused and its cost returned.
tags: [cyber, intelligence]
badges: [patch]
areas: [backend]
---

If a cyber operation was sent twice at the same moment, for example by a double
click, both requests could pass the cooldown check. The second was charged and
then failed with an error. Now only one launch per target each turn goes
through. The other is refused with the usual cooldown message and its cost is
returned to the appropriation.
