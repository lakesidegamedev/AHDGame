---
date: 2026-10-26
title: Winding-down funds close even when a former investor's account is gone
summary: >-
  A fund that was closing could fail at the final payment every turn if one of
  its investors or its sponsor no longer existed. The remaining investors are
  now paid and the fund closes.
tags: [index-funds, funds, economy]
badges: [patch]
areas: [engine]
---

## What changed

- When a fund is closing, it now pays every investor whose account still
  exists. An investor or sponsor account that no longer exists is skipped
  instead of stopping the payment.
- No investor's own payout changes. Cash that would have gone to an account
  that no longer exists is not shared out among the other investors: it goes
  back to the fund's sponsor with the rest of the leftover cash, the same way
  the fund's own reserve units already do.
- A closing fund whose sponsor account is gone now finishes and records that
  the leftover cash could not be returned.
