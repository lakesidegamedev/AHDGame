---
date: 2026-11-11
title: "Restore successor-country account and metric continuity"
summary: >-
  Reconcile transferred savings without duplicating balances, connect Ulster to
  Irish party access, and keep successor-country metrics readable after conversion.
tags: [countries, savings, parties, metrics]
badges: [patch]
areas: [backend, engine]
---

## What changed

- Currency transfers reconcile savings accounts and their backing without crediting
  the same money twice.
- Ulster connects to neighboring Irish regions for party access after reunification.
- Scottish and Welsh inherited metrics retain their measurement dates and receive
  valid publication dates at independence.
- Northern Ireland's inherited UK household readings remain labeled estimates until
  Irish country-wide inputs can certify them. Existing affected boards normalize on
  read and persist corrected metadata in the normal guarded turn batch.
- Metric repairs preserve values and historical samples; they do not restart turns
  or bypass payment and processing guards.
