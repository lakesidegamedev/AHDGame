---
date: 2026-10-31
title: Promotions wait longer to reuse development's run
summary: >-
  A development to staging promotion now waits up to 60 minutes, instead of
  35, for development's own CI run on the same tree before falling back to a
  second full suite. No gameplay change.
tags: [ci, performance]
badges: [patch]
areas: [backend]
---

## Why

On 2026-10-31 development's push run spent most of its 36 minutes waiting for a
shared hosted runner. The promotion stopped waiting at 35 minutes, then queued
and ran the whole suite again on the same tree.
