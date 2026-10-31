---
date: 2026-10-27
title: Government bonds held by a bank count as cash for runs and confidence
summary: >-
  A bank's sovereign treasury holdings now count with its vault cash when the
  game scores depositor confidence and tests whether a run has broken the bank.
tags: [banking]
badges: [patch]
areas: [backend]
---

## What changed

- Banks park spare cash in government bonds automatically. Those bonds now count as liquid cover in the confidence score, the run failure test, the bank console risk readout and the next-turn outlook.
- Before this, a bank holding most of its money in government bonds looked cashless. A panic elsewhere could drain its vault and close it while it still held billions in bonds.
