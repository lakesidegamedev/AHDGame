---
date: 2026-11-12
title: "Landing page responds sooner on phones"
summary: >-
  The background globe on the landing page now starts after the page has
  finished loading, so the headline and buttons are usable sooner.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The landing globe starts drawing once the page has loaded and the browser is idle, instead of during startup.
- On slow phones the headline and buttons respond sooner; the globe appears a moment later.
