---
date: 2026-11-23
title: "Crisis responses check the cash the treasury can actually spend"
summary: >-
  Choosing a costly crisis response when the treasury was short of cash
  showed an unexpected error. The game now checks spendable cash first and
  says plainly that the treasury cannot pay.
tags: [crises, budget]
badges: [patch]
areas: [fullstack]
---

## What changed

- A crisis response or contribution is checked against the treasury's spendable cash, the money it actually pays from, instead of its overall balance. If the cash is short you get a clear message and nothing is recorded.
- Any other action the treasury cannot pay for now says so instead of showing an unexpected error.
- The index listing petition panel on a company page loads faster: it reads each currency's exchange rate once instead of once per company in the index.
