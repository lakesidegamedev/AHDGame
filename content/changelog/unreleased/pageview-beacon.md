---
date: 2026-11-14
title: "Anonymous page counts no longer slow the first load"
summary: >-
  The anonymous page count now goes out as one small request, and the analytics
  library only loads when you first touch the page.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Before you answer the cookie banner, the page view is sent as a single small request with the same anonymous details as before: page address, referring site and campaign tags. Nothing is stored on your device.
- The analytics library itself loads on your first tap, key press or scroll, so it no longer competes with the page loading.
- If you accept analytics, nothing changes for you.
