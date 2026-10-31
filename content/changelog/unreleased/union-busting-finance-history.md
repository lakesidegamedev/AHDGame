---
date: 2026-10-27
title: Union-busting costs now show in company finance history
summary: >-
  A union-busting attempt takes cash from the company, but the payment never
  appeared in its finance history, so large busts looked like missing money.
  Each attempt now records its own line.
tags: [corporations, labour, finance]
badges: [patch]
areas: [backend]
---

## What changed

- Every union-busting attempt writes a "Union-Busting Attempt" line to the
  company's finance history for the cash it cost, whether the attempt
  succeeded or backfired.
- The line names the sector and records unionization before and after.

The cost of busting is unchanged: half of the sector's revenue scale, as
before.
