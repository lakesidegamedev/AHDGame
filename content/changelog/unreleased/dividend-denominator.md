---
date: 2026-11-01
title: Fixed a rare dividend miscalculation
summary: >-
  A rare share-count mismatch could make a company's dividend pay out far more
  than its dividend pool. Dividends now never exceed the pool.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, dividends, economy]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend, engine]
---

## What changed

- Fixed a rare dividend miscalculation that could overpay shareholders of a
  company with new shares still being placed on the market.
- Share structure changes wait for unfinished issuances to complete. Completed
  issuance metadata stays in step with the company's share counts.
