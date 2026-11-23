---
date: 2026-11-23
title: Keep a per-turn record of each bank's deposit ceiling
summary: >-
  Each turn's company history now records a bank's deposits, deposit ceiling
  and how full it was.
tags: [banking, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Every turn's company history row for an active retail or universal bank now stores its deposits, deposit ceiling, branch share and how full the ceiling was. Until now only the current figures were kept, so a jump in the ceiling could not be traced afterwards. Investment banks and other companies record nothing new.
