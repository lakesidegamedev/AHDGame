---
date: 2026-11-14
title: "Landing and login pages load less for signed-out visitors"
summary: >-
  The landing and sign-in pages no longer load the signed-in game chrome that
  does nothing for visitors who are not signed in.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Visitors who are not signed in no longer download or start the status bar, gates, tutorial coach and similar signed-in features on the landing and sign-in pages.
- Links from those pages to other pages open as a full page load so the full layout is always there.
- Signed-in players see exactly what they saw before.
