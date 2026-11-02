---
date: 2026-11-03
title: Mothball a sector from its row
summary: >-
  The sector list's actions menu now has Mothball, or Reactivate on a stowed
  sector, so you no longer have to open the sector page to stow its plants.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, quality-of-life]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend]
---

## What changed

- The three dot menu on each row of a corporation's sector list now offers
  Mothball next to Details, Build capacity and Abandon. On a mothballed sector it
  offers Reactivate instead (suggestion 412).
- The phone layout of the row gets the same button.
- It uses the same action as the sector page, so the rules are unchanged: CEO
  only, plants tier only, and mothballed plants make nothing and still cost
  upkeep.
