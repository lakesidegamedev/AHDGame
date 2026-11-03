---
date: 2026-11-03
title: Contributor changes to the economy need a maintainer's approval
summary: >-
  Pull requests from contributors that touch economy or turn code now need a
  maintainer's approval before they can merge, and every contributor PR must
  say whether it affects the author's own holdings.
tags: [development, contributing]
badges: [patch]
areas: [backend]
---

## What changed

- Contributor pull requests must keep the conflict-of-interest section and tick
  exactly one box.
- Contributor changes to economy or turn code (markets, banking, trade, budgets,
  corporations, the turn engine) need a maintainer's approval on the current
  commit before they can merge.
- Contributor changes to CI workflows, code owners or the review scripts also need
  a maintainer's approval, checked by a guard that a pull request cannot edit.
