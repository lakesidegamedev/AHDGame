---
date: 2026-11-03
title: Alt checks only count accounts that share one device fingerprint
summary: >-
  The staff alt check raised its strongest alert from every account linked by any
  fingerprint, so two separate two-account coincidences looked like one shared
  device. It now escalates only when a single fingerprint is held by three or more
  accounts.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [staff, moderation]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [hotfix]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend]
---

## What changed

- The staff alt check collected every account sharing any of a player's browser
  fingerprints, then raised its strongest alert once that whole group reached three
  accounts. Two unrelated two-account coincidences were therefore enough to read as
  one shared device.
- It now raises the strongest alert only when one fingerprint is held by three or
  more accounts, which is what the alert is meant to describe. Smaller groups still
  appear at the lower level for staff to review.
- No game rules changed and no player-facing page is affected.
