---
date: 2026-11-24
title: "Elections list loads faster"
summary: >-
  The country elections page skips data it never shows, so it is built and
  sent faster.
tags: [performance, elections]
badges: [patch]
areas: [backend]
---

Building the elections list read a large internal record for every
non-player candidate that the list never uses, and sent each race's full
candidate and polling detail to the browser. The page now reads only what the
list shows and sends only the race leader's party details, so it appears
sooner. Nothing on the page changes.
