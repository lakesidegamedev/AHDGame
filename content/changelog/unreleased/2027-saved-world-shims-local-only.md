---
date: 2026-11-11
title: "Old-law compatibility tables are marked as local-save only"
summary: >-
  The tables that keep old saved worlds working are now documented as being for
  local singleplayer saves, which are never reset.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- No gameplay change. The old-law compatibility tables now say in code that they exist only for local saves, and that a reset replaces every id they cover.
