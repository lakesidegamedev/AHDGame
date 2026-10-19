---
date: 2026-10-18
title: Deposit sharing counts what mines can actually dig
summary: When a state's deposit is shared between mines, each mine now claims only what its plants can produce this turn, not its full revenue potential.
badges: [patch]
areas: [fullstack]
tags: [extraction, corporations, economy]
---

- Mines sharing a state's deposit now claim only the output their working plants can dig this turn. Parked or mothballed capacity no longer counts towards the claim.
- A state's mines are no longer cut back when their combined real digging is below what the deposit allows. When real digging does exceed the deposit, mines are still cut in proportion as before.
