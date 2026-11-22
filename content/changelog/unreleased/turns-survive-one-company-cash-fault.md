---
date: 2026-11-22
title: Keep turns running when one company's cash goes wrong
summary: >-
  A rounding leftover on a company already below zero no longer stops the turn. A company
  the market would overdraw is kept out of buying for that turn instead of stopping everyone.
tags: [economy, corporations, turns]
badges: [patch]
areas: [backend]
---

## What changed

- Companies already below zero are no longer treated as overspending when the market leaves a fraction of a cent on their account.
- If the market would take more cash from a company than it had, the turn re-runs the market once with that company kept out of buying, logs a warning naming it, and continues.
- Turn errors about company cash now name the account and the amounts involved.
