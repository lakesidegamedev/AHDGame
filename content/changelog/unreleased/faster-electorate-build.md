---
date: 2026-11-24
title: "Election projections compute faster"
summary: >-
  Building each state's electorate for polls and projections does less
  repeated work, so election pages and turns spend less time on it.
tags: [performance, elections]
badges: [patch]
areas: [backend]
---

Every election projection rebuilds the voter groups for each state. That step
made several throwaway copies of every voter group to apply legislation's
effect on their views. It now applies the same effect directly, with
identical results, so the presidential race and elections pages render faster
and turns do less work.
