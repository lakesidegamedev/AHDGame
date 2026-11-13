---
date: 2026-11-13
title: "A turn cut off mid-step now waits for a person instead of skipping money steps"
summary: >-
  If the game process dies while money steps of an hourly turn are in flight,
  the turn is held and an alert is raised, rather than finishing without those
  steps. An admin releases it after checking. Off until switched on.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A turn that lost its process mid-step on anything other than a short list of harmless steps is held, not resumed.
- The hold keeps all evidence, raises an alert naming the turn and steps, and no automatic takeover touches it.
- A new admin release action reruns or marks done the held steps after a person has checked them.
- The admin lock reset refuses a held turn and points to the release action.
- Nothing changes until the turn resilience switch is turned on.
