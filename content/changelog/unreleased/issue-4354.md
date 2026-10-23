---
date: 2026-10-23
title: Broken manifesto pledges now bleed UK government confidence each turn
summary: >-
  The confidence card promised that breaking manifesto pledges costs the
  government confidence, but the per-turn tick never looked at the pledges. It
  does now, judged against the laws actually in force.
tags: [uk, government, confidence]
badges: [patch]
areas: [engine]
---

## What changed

- Each turn judges the governing party's most recent locked manifesto against the national laws in force and feeds the kept share into the confidence gauge.
- A government with no formed administration, no locked manifesto, or no recognised pledges gets no pledge bleed at all, so an unjudgeable government is not treated as having broken everything.
- The confidence gauge's existing broken-promise bleed is unchanged; it is now actually supplied.
