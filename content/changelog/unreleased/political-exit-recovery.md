---
date: 2026-11-22
title: "Political appointments and exits recover together"
summary: >-
  Senate appointments count correctly in votes. Interrupted dissolutions,
  government departures and resignations no longer leave half-applied offices.
tags: [politics, elections, cabinets, senate]
badges: [patch]
areas: [engine, backend]
---

## What changed

- New US Senate appointees carry the correct country, and existing untagged US seats remain eligible in nomination tallies. Competing vacancy appointments cannot seat two replacements.
- Snap elections commit replacement races, dissolution and government cleanup together. Repeated requests cannot create an overlapping snap batch.
- Lost-seat government departures commit cabinet cleanup and office restoration together.
- Settings and cabinet-page resignations share the same exit rules: restore a surviving legislative seat, retain a second ministry where permitted, and apply the same confidence consequence.
- Removing an inactive or resigning party chair clears their coalition authority in the same transaction, without clearing a replacement holder.
