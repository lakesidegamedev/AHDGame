---
date: 2026-11-18
title: "Bond screen now says how much the market will actually fund"
summary: >-
  The credit and bonds tab no longer promises the full face value in cash. It
  shows what the bond market pool will buy at issuance, and that the rest places
  over later turns as cash allows.
tags: [bonds, corporations, ui]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- The issuance panel used to say a corporation receives the full face value in cash now. That has not been true since the bond market pool started underwriting new issues with its own cash, so a large issue funded only the part the pool could buy.
- The bonds tab now shows what the pool can fund at the current rating, and how much of a larger issue would stay unsold and place over later turns.
- The panel also no longer claims coupons are charged on units that never sell. Unsold units are not debt and carry no coupon until they place.
- The slider ceiling is unchanged. It is still the legal borrowing limit, which is larger than the pool's cash.
