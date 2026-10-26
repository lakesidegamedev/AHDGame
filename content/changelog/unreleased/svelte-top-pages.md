---
date: 2026-10-26
title: Profile, market, portfolio, elections and actions load less code
summary: >-
  The most visited player pages now download between a quarter and three
  quarters less code before they are usable.
tags: [performance, mobile, frontend]
badges: [patch]
areas: [frontend]
---

## What changed

- Your profile shows office titles worked out on the server instead of
  downloading the cabinet tables.
- Market, portfolio and election pages load only the panel or stage you are
  looking at.
- The actions page loads event, debate, crisis and endorsement banners only
  when one is active.
