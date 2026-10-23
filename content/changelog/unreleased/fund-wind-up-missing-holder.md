---
date: 2026-10-23
title: Closing funds finish when a holder has gone
summary: >-
  A fund that is winding down now pays the holders still there and closes, even
  if one investor's record has been removed.
tags: [economy, funds]
badges: [patch]
areas: [engine]
---

## What changed

- A winding-down fund used to stop at its final payout when any one holder no longer existed, such as a corporation that had been dissolved or a deleted character, computer investor or pension scheme. It now pays every holder it still can and then closes.
- The missing holder's units are cleared with every other position, and the cash behind them goes back to the sponsor with the fund's other leftover cash.
- Funds where every holder still exists pay out exactly as before.
