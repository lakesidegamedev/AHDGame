---
date: 2026-10-21
title: The hourly turn reads a third less and stops retrying dead settlements
summary: >-
  Settlement recovery no longer walks payouts whose recipient was deleted, the
  sovereign coupon queue is bounded by the cash a Treasury actually holds, and
  the turn's heaviest collection reads now project only the fields they use.
  The benchmark turn returns 27.5% less BSON and a fifth fewer settlement reads.
tags: [performance, turn, banking, treasury]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Recovery checks the targets of an unfinished money move before resuming it.
  A payout whose payee was deleted is reported as still partial instead of
  re-reading its whole journal every turn; the live world carries eleven such
  moves (five sovereign maturities with 120–170 legs, six media refunds).
- Money-move journal reads project only the leg being applied, the applied and
  refusal marks for a batch, and the completion fields — not the entire
  receipt once per leg.
- The funded sovereign coupon pass loads only claims the budget's cash can
  cover this turn, plus claims a prior or grouped receipt already owns. One
  indexed prior-payout read per turn replaces an `$or` with one `_id` regex per
  open claim, and a covering index serves the queue probe and sort.
- NPP corporate attacks, state ownership, the stock exchange snapshot and the
  bond/default paths read only the fields they use; the latter exclude
  `settledKeys`, about half of a corporation document.
- Index-fund rebalancing no longer re-reads the whole fund before each sell leg.

No balance, rate, tax, price, dividend or RNG input changed, and no write order
moved. On a clone of the production core the benchmark turn returns 836.8 MB of
BSON instead of 1,154.4 MB (−27.5%) and 39,904 round trips instead of 41,318.
