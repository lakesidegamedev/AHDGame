---
date: 2026-10-25
title: Economy-only reset starts the rebuilt economy from fresh-world settings
summary: >-
  The economy-only reset now also clears every market lever that was staged
  onto the old economy, reseeds commodity prices and exchange rates at their
  era values, and removes the old price, trade and wealth history. Politics,
  budgets and debt are untouched. Admin tooling only.
tags: [economy, admin, reset]
badges: [patch]
areas: [backend]
---

## What changed

- The reset writes the fresh-world gameplay flags and removes the market
  recovery stage, the launch governor and its glide, the launch guard
  references, every funded producer market lever and every turn-anchored stamp
  (nominal price index, phase-in turns, scheduled recessions). The commodity
  treadmill fix and the standing cost rules stay.
- Current commodity prices go back to their era base prices and exchange rates
  to their seed rates. Central bank chairs, boards, policy rates and reserves
  stay; their per-turn rate, inflation and growth series are cleared.
- Price history, commodity flow and sourcing ledgers, trade history and
  snapshots, the retired commodity archive, portfolio history and wealth list
  snapshots are deleted with the rest of the old economy.
- The launch guard and the four Markets Watch programmes (fund equity quotes,
  fund absorption of unheld sovereign paper, rule-based NPP founding into
  empty and thin markets) start switched off. The input relief and holding
  tax phase-ins restart at the reset turn.
- The census reports the reseeded reference rows beside the wiped ones.

No live world changes until an operator runs the reset.
