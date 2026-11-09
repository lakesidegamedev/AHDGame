---
date: 2026-11-07
title: Operators get a repair command for a turn held after a mid-economy restart
summary: >-
  When a restart cuts off the company-profit step, the turn is held for repair.
  A new command checks what was saved and lets the turn finish safely.
tags: [engine, operations]
badges: [patch]
areas: [engine]
---

## What changed

- A turn held because the company-profit step was interrupted can now be
  inspected and repaired with one command. It shows what the step saved for
  that turn and recommends one of three outcomes.
- If nothing was saved, the step is marked to run again. If everything was
  saved, the step is marked done so the turn skips it. If only part was saved,
  the command refuses and a manual fix is needed.
- It does nothing unless told to apply, and it never releases the turn itself.
  The normal resume carries on from there.
