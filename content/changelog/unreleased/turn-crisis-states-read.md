---
date: 2026-11-09
title: "Crisis turn reads the region list once"
summary: >-
  The crisis step now reuses the region list the crisis watchers already load
  each turn. No gameplay changes.
tags: [engine, performance]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The crisis step shares one region lookup with the crisis watchers each turn instead of reading it again.
