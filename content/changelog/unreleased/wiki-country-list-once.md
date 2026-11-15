---
date: 2026-11-15
title: Wiki index loads the country list once
summary: >-
  The wiki front page now reads the list of playable countries once per visit
  instead of three times, so it loads with less work on the server.
tags: [wiki, performance]
badges: [patch]
areas: [backend]
---

## What changed

- The enabled-country list is read once per page render and shared by every
  part of the wiki index that needs it.
