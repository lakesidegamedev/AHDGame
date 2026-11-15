---
date: 2026-11-13
title: "Landing and login pages start faster"
summary: >-
  Error reporting on the landing, login and other public pages now loads after
  your first tap or scroll, so the page responds sooner.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Error reporting no longer loads while a public page is starting up. A small stand-in notes any early error and sends it once reporting loads.
- Reporting loads on your first tap, key press or scroll, on the first error, or after 30 seconds on a visible tab.
- Signed-in pages are unchanged.
