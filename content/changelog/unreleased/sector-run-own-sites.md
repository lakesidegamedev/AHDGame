---
date: 2026-11-03
title: Sector run chart separates output sent to your sites
summary: >-
  The sector run chart shows goods sent to your own sites separately from
  unsold goods, so useful internal deliveries no longer look like wasted output.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, production]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend]
---

## What changed

- Added a separate chart segment for output sent to the company's own sites.
- Unsold output now excludes those deliveries while external sales retain their own segment.
