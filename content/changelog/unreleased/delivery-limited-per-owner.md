---
date: 2026-11-06
title: Sector "stuck" figure now reflects your own goods
summary: >-
  The delivery warning on a sector used to show how much of the whole state's
  output was stuck. It now shows how much of your company's own output from that
  state was stuck.
tags: [economy, logistics]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- A sector's "stuck" percentage is now worked out from your company's own goods
  leaving that state, not every seller's. If your goods ship on your own routes
  or trucks while rivals' goods are stuck, your sector no longer shows the
  rivals' number.
- Companies that are not tracked for their own shipments in a state still see
  the state-wide figure, as before.
- Only the number shown changes. Prices, offers and revenue are unaffected.
