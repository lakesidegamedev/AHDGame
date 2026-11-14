---
date: 2026-11-14
title: "The top bar no longer downloads every country's details"
summary: >-
  The navigation bar only needs a short code for the country you are viewing,
  so it no longer downloads the full office and title lists for every country.
  The home and sign-in pages start faster as a result.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The country chip in the top bar uses a small list of country codes instead of the full country settings.
- The home page's era helper no longer pulls in the country settings either.
- Nothing about how the bar looks or works has changed.
