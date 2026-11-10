---
date: 2026-11-10
title: "Retirement age now moves the dependency ratio, and the 2027 world opens with a realistic oldest age group"
summary: >-
  The dependency ratio follows the retirement age you set, and the 2027 world
  no longer opens with millions of people over 90.
tags: [demographics, population]
badges: [patch]
areas: [backend]
---

## What changed

- Raising or lowering a country's retirement age now changes its dependency ratio as well as its workforce. Before, only the workforce moved.
- A new 2027 world opens with far fewer people over 90, matching real populations. This removes a spike of deaths in the first year and a falsely high early dependency ratio. Worlds that are already running keep the population they have.
- Long-run population tables for the US, UK, Germany, Japan and China (2027 to 2050) are now generated and tested, including checks that regional totals add up to national totals.
