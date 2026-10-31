---
date: 2026-10-28
title: Stop repeated vacancy snap Discord announcements
summary: >-
  Vacancy-triggered snap elections announce their start to Discord once.
  Hourly processing no longer repeats the announcement for a running snap.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [elections, discord]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Suppress repeated automatic vacancy-snap announcements while that country's snap election is active or upcoming.
- Use the existing snap timestamp to prevent concurrent starts from posting duplicate announcements.
- Allow a later snap election to announce its own start.
