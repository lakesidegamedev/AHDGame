---
date: 2026-11-24
title: "State party pages download about three times smaller"
summary: >-
  State party pages are now compressed like every other page.
tags: [performance, parties]
badges: [patch]
areas: [backend]
---

State party pages were sent to the browser uncompressed, so each visit
downloaded about 345 KB where other pages send about 100 KB. They are now
compressed like the rest of the site and load faster, especially on slower
connections. Nothing on the page changes.
