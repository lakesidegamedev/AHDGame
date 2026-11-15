---
date: 2026-11-15
title: "2027 opening voter lean matches the latest real elections"
summary: >-
  US states now open with voter lean set from the 2024 presidential result and
  Canadian provinces from the 2025 federal vote, fixing a map where Iowa sat
  left of California and every province leaned the same way.
tags: [demographics, elections, us, canada, reset]
badges: [minor]
areas: [engine, backend]
---

## What changed

- US 2027 state lean is fitted to the 2024 presidential margin. The 2027 census had inherited a 2023 calibration that put white voters in Iowa, Florida, Ohio, Minnesota, New Hampshire and New Mexico on the left and softened every Republican state, so the Deep South opened at the center and Iowa opened left of California.
- Canadian provinces and territories get their own lean from the 2025 federal vote. Alberta and Saskatchewan now open on the Conservative side and Manitoba narrowly so; Quebec and Atlantic Canada lean Liberal.
- The same lean drives elections, polls, state and province pages, the map and the home-state picker at character creation.
- New calibration tests fail if any 2027 US state drifts from its 2024 result or any province from its 2025 result.
