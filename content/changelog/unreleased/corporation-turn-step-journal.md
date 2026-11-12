---
date: 2026-11-12
title: "Company turn steps are journaled for safe resume"
summary: >-
  Behind the same switch that is off, each company turn step now records when it
  starts and finishes, so an interrupted turn skips finished steps and stops on
  any step it cannot prove safe to repeat. Nothing changes for players while off.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- With the turn resilience switch on, company turn steps are marked started and done, and their results are stored for a resume.
- A resumed income payout accepts the payout already recorded for the turn instead of failing.
- The labour index change uses the starting values captured once per turn.
- With the switch off, nothing changes.
