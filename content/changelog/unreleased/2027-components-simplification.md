---
date: 2026-11-08
title: "Behind-the-scenes tidy-up of screen code"
summary: >-
  Merged duplicated screen code and removed branches that could never run, so
  the project is smaller and easier to maintain. Nothing changes for players.
tags: [frontend, maintenance]
badges: [patch]
areas: [frontend]
---

Repeated button, table and form code on several admin, party, corporation and
landing screens was folded into shared pieces, and a few unreachable display
branches were removed. Screens, numbers and wording are unchanged.
