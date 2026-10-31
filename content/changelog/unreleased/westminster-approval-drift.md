---
date: 2026-10-30
title: Separate Westminster approval from constitutional stance
summary: >-
  Low Westminster approval now increases independence or reunification desire
  regardless of Westminster's stance. High approval reduces it, with the same
  existing strength and cap.
tags: [devolution, approval, referendums]
badges: [patch]
areas: [engine, frontend]
---

## What changed

- Westminster approval below 50% raises desire in Scotland, Wales and Northern Ireland; above 50% lowers it, and 50% is neutral.
- The effect remains 0.001 per approval point from 50, capped at 0.025 per turn. Regional approval still follows the First Minister's stance.
- Dashboard explanations and referendum wiki guidance describe the separate effects.
