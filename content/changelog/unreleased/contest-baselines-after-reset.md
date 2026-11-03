---
date: 2026-11-03
title: Company contests fill in after an economy reset
summary: >-
  The weekly company growth and comeback contests no longer stay empty for a
  whole week when they open right after an economy reset.
tags: [contests, corporations]
badges: [patch]
areas: [backend]
---

## What changed

- The company growth and comeback contests take each company's starting value
  from its recent history. Right after an economy reset there is none, so these
  contests opened with nobody in them and stayed empty all week, with no prize.
- A contest that opens empty now enters companies on the first turn their
  history exists, and growth counts from that turn.
- No game rules changed.
