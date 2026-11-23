---
date: 2026-11-23
title: Keep a per-turn record of each bank's branch network
summary: >-
  Each turn's company history now records how full a bank's deposits were and
  how much of its financial capacity its branches took, so a turn where a
  bank's financial output drops can be explained afterwards.
tags: [banking, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- A deposit-taking bank gives part of its financial capacity to its branch network, up to the share its CEO sets, scaled by how full its deposits are against the deposit ceiling. That share comes off its financial-services output. Until now only the current figures were kept, so a turn where output halved with no cash or input shortage could not be traced.
- Every turn's company history row for an active retail or universal bank now stores its deposits, deposit ceiling, branch share, how full the ceiling was, and the share of capacity branches took that turn. Investment banks and other companies record nothing new.
