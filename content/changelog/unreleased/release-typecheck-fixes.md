---
date: 2026-11-11
title: Type fixes for the political metrics compare view and update notices
summary: >-
  The political metrics compare view now starts with every playable country
  in the one law book selected, including Germany, Japan and China. Two other
  type errors found by the full code check are fixed.
tags: [political-metrics, maintenance]
badges: [patch]
areas: [frontend]
---

## What changed

- The compare view's country toggles are built from the list of countries in
  the political metrics system, so Germany, Japan and China start switched on
  like the others.
- The game update notice reads the player list with a typed query.
- A Canada law book test imports the law book from Canada's folder.
