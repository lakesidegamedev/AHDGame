---
date: 2026-10-31
title: Moderators can block devices from creating accounts
summary: >-
  Moderators can block devices from creating accounts, so a banned player
  cannot start over on the same device.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: []
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend]
---

## What changed

- Registration now refuses devices that moderators have blocked.
