---
date: 2026-11-11
title: "A country one refresh behind no longer stops the turn"
summary: >-
  The turn no longer halts when one country's metrics are a refresh behind
  another's, and one country without income data no longer costs every player
  their campaign income.
tags: [turns, economy]
badges: [patch]
areas: [backend]
---

## What changed

- A country whose metrics are one refresh behind another country is now read
  as it was last refreshed, instead of being treated as half written. This was
  halting the corporation phase and the whole turn.
- Campaign income now skips characters of a country that has no income
  baseline yet, instead of failing the phase for every player.
