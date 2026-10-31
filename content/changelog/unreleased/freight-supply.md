---
date: 2026-10-31
title: Freight shortages fill faster
summary: >-
  States short of freight now get new trucking capacity sooner. Building
  logistics where it is needed no longer costs a fortune because of fleets in
  other countries, AI companies see each state's own shortage, and new fleet
  arrives in 15 turns instead of 36.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, corporations, logistics, balance]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend, engine]
---

## What changed

- The size surcharge on new capacity now judges freight, construction,
  healthcare and real estate services against the state you build in, counting
  only your capacity in that state. These goods are sold where they are made,
  so idle capacity elsewhere no longer makes a build in a short state cost
  many times its normal price.
- AI companies now read each state's freight supply against its demand when
  deciding whether to open or grow a logistics business, so a badly short state
  gets built into even when the national freight price looks normal.
- New logistics capacity takes 15 turns to build instead of 36.
- AI-run companies no longer order new capacity while any of their plants
  could not run last turn for lack of cash. They keep that cash for the plants
  they already have.
