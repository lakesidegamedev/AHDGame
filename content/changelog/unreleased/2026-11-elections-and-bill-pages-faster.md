---
date: 2026-11-23
title: "Elections list, presidential race and bill pages load faster"
summary: >-
  The country elections list sends far less data and shows its frame sooner, and bill pages arrive with their
  content already loaded.
tags: [performance, elections, legislature]
badges: [patch]
areas: [fullstack]
---

## What changed

- The country elections list no longer downloads avatars, endorsements and other details it never shows, which cuts the page size by roughly a third.
- The elections list now shows its page frame right away while the race data finishes loading.
- Bill pages arrive with the bill already loaded instead of showing a loading screen first.
- The presidential race page loads its related data in parallel, so it appears sooner.
