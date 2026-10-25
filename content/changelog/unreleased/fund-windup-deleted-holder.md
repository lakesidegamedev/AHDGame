---
date: 2026-10-25
title: A fund can finish winding up after a holder is deleted
summary: >-
  A sponsored fund used to stall forever when a position belonged to a holder
  that no longer exists, such as an NPP removed by a party merge. The wind-up
  now skips that holder and returns its unpayable share to the sponsor, so
  everyone else is paid and the fund closes.
tags: [index-funds, payouts, windup]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Wind-up now checks, in one batched read per holder collection, which positions
  still have a holder record. A position whose character, NPP, imperial
  character, corporation or pension scheme was deleted is skipped instead of
  failing the whole distribution.
- Its units are zeroed with every other position, and the cash that would have
  been paid to it stays in the fund and flows to the sponsor through the
  existing residual return, so the fund's cash still adds up.
- Any other payout failure still stops the wind-up and is reported as before. A
  malformed position with no holder id is still an error, not a skip.
