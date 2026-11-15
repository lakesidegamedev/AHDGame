---
date: 2026-11-10
title: "World setup stops instead of guessing a missing era"
summary: >-
  If a world has no era recorded, setup now stops with a clear message instead of
  quietly building a 1953 or 2019 world.
tags: [admin, seeding]
badges: [patch]
areas: [backend]
---

A few setup steps used to assume an era when none was recorded. They now stop and
say which era is missing, so a world can never be half built from another era's
data.
