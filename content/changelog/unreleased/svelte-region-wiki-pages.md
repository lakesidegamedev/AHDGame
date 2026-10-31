---
date: 2026-10-26
title: Region, approval, election and wiki pages load much less code
summary: >-
  State and region pages, approval ratings, country elections and the wiki now
  download between a third and almost all less code before they are usable.
tags: [performance, mobile, frontend]
badges: [patch]
areas: [frontend]
---

## What changed

- State and region pages load each tab when you open it.
- Approval pages and the wiki no longer download country and metric data
  they never show.
- Country election pages load the election night view only during a live
  count.
