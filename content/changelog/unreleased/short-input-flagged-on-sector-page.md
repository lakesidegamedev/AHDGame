---
date: 2026-11-09
title: Sector page marks the input that ran short
summary: >-
  The Things you buy list now tags the input that held your plants back, and
  says so when the game did not record which input it was.
tags: [corporations, ui]
badges: [patch]
areas: [fullstack]
---

## What changed

- When a sector lost run to a short input, the matching row in Things you buy now carries a Short input tag, so the Inputs list the run report points to actually names it.
- If inputs held plants back but no input was recorded for that turn, the page says so instead of staying silent.
