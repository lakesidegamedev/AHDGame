---
date: 2026-10-19
title: Reuse shared dropdown dismissal handling
summary: >-
  Reuse the existing outside-click and Escape hook across five navigation dropdowns.
  Preserve menu interactions, contents, visibility, and styling.
tags: [cleanup, navigation]
badges: [patch]
areas: [frontend]
---

## What changed

- Replaced five duplicated event effects with the shared dismissal hook and stable callbacks.
