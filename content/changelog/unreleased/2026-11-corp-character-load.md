---
date: 2026-11-23
title: "Corporation, sector and character pages load faster"
summary: >-
  Corporation and sector pages stop loading whole company records just to pick the page theme,
  and character profiles load their data in one parallel step.
tags: [performance, corporations, profiles]
badges: [patch]
areas: [fullstack]
---

## What changed

- Corporation and sector pages start up faster because they read only the few fields they need first.
- Character profiles fetch their party, office, campaign and finance details at the same time instead of one after another.
