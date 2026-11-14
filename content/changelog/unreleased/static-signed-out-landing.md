---
date: 2026-11-14
title: "The home page for signed-out visitors loads almost instantly"
summary: >-
  The home page you see before signing in is now a lightweight page served
  directly, with the countdown, cookie choice and globe loading as small extras.
  It looks the same and loads far faster on a phone.
tags: [performance]
badges: [patch]
areas: [fullstack]
---

## What changed

- Signed-out visitors get a plain, pre-built home page instead of the full game app, so text and buttons appear straight away.
- The launch countdown, cookie choice and interactive globe are small separate scripts that load on their own. The globe still appears over the same picture once you touch the page.
- Signing up, signing in and everything for signed-in players works exactly as before.
