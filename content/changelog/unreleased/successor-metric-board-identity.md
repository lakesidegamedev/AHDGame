---
date: 2026-11-11
title: Keep successor-country metrics usable after independence
summary: >-
  National metrics created during independence remain readable after database
  storage, preventing approval and corporation processing from rejecting them.
  Existing affected records are normalized during their next metric refresh.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [metrics, referendums, turn-processing]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Omit the region field from newly promoted national metric boards before BSON storage.
- Accept legacy null region fields only on national boards, keeping regional identity validation strict.
- Remove the legacy field in the existing batched refresh without replacing observations or history.
