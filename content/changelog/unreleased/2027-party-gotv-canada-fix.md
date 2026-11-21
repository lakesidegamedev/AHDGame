---
date: 2026-11-17
title: "Party turnout campaigns run again in every country"
summary: >-
  A turn step that pays for party turnout and registration campaigns was
  failing because it could not price Canadian regions. It now reads every
  region's country correctly.
tags: [parties, canada]
badges: [patch]
areas: [engine]
---

## What changed

- Party turnout and registration campaigns were being skipped each turn, for parties in every country, because Canadian regions could not be priced.
- The step now reads each region's country when it prices campaign money, so Canadian parties are handled like every other country.
