---
date: 2026-11-12
title: "Anonymous page counts for site traffic"
summary: >-
  We now count anonymous page views so we can see which pages and sources bring
  visitors. Nothing is stored on your device until you accept the cookie banner.
tags: [engineering, privacy, analytics]
badges: [patch]
areas: [frontend]
---

## What changed

- Before you answer the cookie banner, only anonymous page views are counted: the page address, the referring site and campaign tags. No cookies, no storage, no identity, no session recording.
- After you accept, full analytics start on your next page load.
- Analytics now start only after the page has finished loading and is idle.
