---
date: 2026-10-28
title: Winding-down funds finish when a company they held is gone
summary: >-
  A fund closing down could wait forever if it still held shares of a company
  that no longer existed. Those shares are now written off at zero so the fund
  can pay its holders and close.
tags: [economy, corporations, index-funds]
badges: [patch]
areas: [backend, engine]
---

## What changed

- A fund that is closing down no longer stops at a holding whose company no
  longer exists. The sale path cannot sell those shares and used to leave the
  position in place every turn, so the fund never reached the point where it
  pays holders and closes.
- The position is now written off at zero, the same way closed companies are
  already cleared from a fund's book during a normal rebalance. A company that
  no longer exists has no shares to sell, so the holding had no cash value; the
  fund's remaining cash is paid to holders and the fund closes.
