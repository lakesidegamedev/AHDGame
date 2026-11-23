---
date: 2026-11-23
title: "Page speed measured from real visits"
summary: >-
  Page load speed is now recorded from real visits so the slowest pages can be
  found and fixed first.
tags: [performance, analytics]
badges: [patch]
areas: [frontend]
---

The game now records how quickly pages load and respond during real visits
(largest paint, layout shift, first paint and input delay). This follows the
same privacy rules as page views: nothing personal is recorded, and players who
declined analytics cookies are still counted without cookies or identity. The
numbers let us rank the slowest pages and fix those first.
