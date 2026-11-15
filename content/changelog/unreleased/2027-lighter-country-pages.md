---
date: 2026-11-10
title: "Lighter pages for country and corporation screens"
summary: >-
  Flag and state lists now load from small files, so several screens download
  less code.
tags: [performance]
badges: [patch]
areas: [engine]
---

Screens that only need a country flag or the list of US states no longer pull
in the full seat tables for every country. Nothing looks different, pages just
download less.
