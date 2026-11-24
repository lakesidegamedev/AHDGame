---
date: 2026-11-24
title: "Game pages load fewer dialogs at startup"
summary: >-
  Game pages wait to load the character setup and season recap dialogs until
  they apply to your account.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The stat allocation, wealth selection and season recap dialogs load when they are needed.
- Visitors without a session skip the tutorial and cabinet offer dialog downloads.
