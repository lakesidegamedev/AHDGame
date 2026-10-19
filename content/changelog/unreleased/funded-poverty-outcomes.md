---
date: 2026-10-19
title: Connect poverty outcomes to funded laws
summary: >-
  Poverty estimates respond to existing enacted laws and their actual funded
  delivery across supported countries. Old adjustments fade gradually, and the
  boards identify poverty as a modeled population-share estimate.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [poverty, legislation, funding, metrics]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend, engine]
---

## What changed

- Existing national and regional poverty-law effects now reach the economy engine through their paid implementation factors. Missing, expired, future and pre-enactment funding do not provide relief.
- Unreplaced opening statutes retain their funded relief. A replacement, including leaving a federal family to the states, suppresses its opening family instead of stacking both versions.
- Relief has diminishing returns and replaces legacy booked social spending for v2 legislation, avoiding a second bonus for the same programs. Employment and active Cabinet effects retain their separate channels.
- Unattributed historical adjustments halve over 48 turns instead of remaining indefinitely. Existing values transition gradually rather than being reset.
- Predetermined political-board crime inputs reach the poverty calculation instead of falling back to a constant.
- Poverty is labeled as a modeled population-share estimate, with population-weighted national aggregation. It is not a surveyed household rate or an official country-specific poverty threshold.
