---
date: 2026-11-17
title: "Discord linking detects account changes"
summary: >-
  Character creation now notices when another account is signed in during Discord linking
  and asks you to reload before continuing.
tags: [accounts, discord]
badges: [patch]
areas: [fullstack]
---

## What changed

- A Discord link on another account no longer unlocks your character creation form.
- Stale character submissions and Discord link requests are refused when the signed-in account changes.
- Your character draft stays saved for the original account.
