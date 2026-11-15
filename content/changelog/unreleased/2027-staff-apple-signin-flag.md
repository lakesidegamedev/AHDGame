---
date: 2026-11-15
title: "Staff can see Apple sign-in accounts"
summary: >-
  The staff Users table and player dossier now flag accounts signed in with
  Apple, which are exempt from the Discord requirement for new characters.
tags: [moderation]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- Staff Users table has a Discord column with an "Apple" badge on accounts that have an Apple sign-in linked.
- The player dossier Identity panel shows the same Apple note.
- New Users filter: "No Discord, Apple-linked".
- Display only. The Apple sign-in itself is never shown to staff.
