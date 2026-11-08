---
date: 2026-11-10
title: "Crisis effects now reach population, capital, trade and refugees, and spread between countries"
summary: >-
  The new crisis model can now cause deaths, destroy a region's capital, restrict
  trade and move refugees, not just nudge statistics. Crises spread to other
  countries through trade, finance, migration and alliances, and the spread
  shows on the crisis map. Authored crises are answered through their responses,
  never twice.
tags: [world, crises]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Crisis effects that cost lives remove residents through the same population accounting as ordinary deaths, capped per effect. Effects that destroy capital create repair obligations on the affected regions, and the owning government pays for repair as it does after a war.
- Effects that move refugees from a named country send them to the other affected countries through the existing reception rules. Each host's asylum and border laws still limit how many arrive, and hosts bear the service costs.
- Trade restrictions raised by a crisis become real embargoes from the affected countries against the countries in the named role, and expire on their own.
- Spillover now has content: the six emergent crises, the authored financial, pandemic, refugee, energy, supply and war crises each name the crises they leak into. Finance spillover is weighted by how much foreign government debt a country holds relative to its own economy, converted at current exchange rates. Spread lines appear on the crisis map.
- Converted crises are answered through their responses only. The old decision path no longer also applies the same option, so a choice is paid for and applied once. Pooled aid and collective nodes keep their treasury-backed paths.
- Government-run countries do not take responses that cost actions, since they have no action budget.
- The conflict response resolver stays the only place that applies a conflict outcome's civilian loss, capital destruction and sanctions, so nothing is applied twice.
