---
date: 2026-11-08
title: "Fewer lost payouts in caucus tax, share splits and buyouts"
summary: >-
  Closes several gaps where money or shares could vanish: caucus tax after a
  failed deposit, party-held stakes in share splits and company wind-ups, and a
  double refund when cancelling a take-private vote.
tags: [economy, corporations, fixes]
badges: [patch]
areas: [backend]
---

## What changed

- If a caucus cannot receive its tax, the tax already collected from members is given back, and the other caucuses are still processed.
- Stakes held by political parties are now kept when a company splits or merges its shares, and are passed on correctly when a company that holds shares in another is wound up.
- Cancelling a take-private vote can no longer refund the reserved cash twice if it is clicked twice or races with the vote closing.
