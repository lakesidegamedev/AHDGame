---
date: 2026-11-01
title: Contributors disclose conflicts of interest
summary: >-
  Anyone contributing code to the game now has to disclose when a change could
  directly help or hurt their own character or corporation.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [contributing, fairness]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- The contributing guide has a new "Conflicts of interest" section. A
  contributor whose change could directly affect a character they play, a
  corporation they own, run or hold shares in, or anything else they control in
  game must disclose it, publicly or privately to a maintainer.
- The pull request template asks every contributor to confirm whether the
  change touches their own holdings.
- Conflicted changes are reviewed against other players' positions and are
  never merged on the author's word alone. An undisclosed conflict can lead to
  the change being reverted and in-game gains being reversed.
