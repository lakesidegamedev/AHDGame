---
date: 2026-11-06
title: Builds no longer starve a profitable company's next run
summary: >-
  A build paid partly by a loan now keeps the running reserve for the part you
  pay in cash, plants count what your own sites pay them when judging whether
  their sales fund the run, and the build screens show how much of next turn's
  run the build would cut.
tags: [economy, corporations]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- A build funded in part by a loan or bond is held to the three-turn running
  reserve for the part you pay from cash. Before, it skipped the reserve
  entirely, so a big loan-backed build could still empty the cash that runs
  the plants. You can still confirm past the reserve.
- When a company is short of cash, a plant whose sales pay for its running
  costs keeps running. That check ignored what your own sites pay each other
  for deliveries, so a company that feeds its own plants looked less profitable
  than it was and its plants were cut anyway. Those deliveries now count.
- The single and bulk build screens now show, before the confirm button, the
  cash you will have left and how much of next turn's run would be cut, or that
  it will be kept.
