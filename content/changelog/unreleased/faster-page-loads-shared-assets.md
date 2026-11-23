---
date: 2026-11-23
title: "Pages load faster on repeat visits"
summary: >-
  Images, map outlines and icons are now kept by your browser between pages,
  and the experimental page decode no longer hides a page that has already
  loaded.
tags: [performance]
badges: [patch]
areas: [frontend]
---

Logos, Keir's sprite sheet, map outlines and other fixed images used to be
downloaded again on every page. Your browser now keeps them, so moving between
pages fetches less and shows the page sooner.

The navbar logo and Keir's sprite sheet are much smaller files that look the
same.

With the experimental page decode switched on, a page that arrives already
readable now stays on screen instead of being hidden while a side panel
finishes loading.
