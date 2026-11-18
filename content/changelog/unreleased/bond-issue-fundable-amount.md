---
date: 2026-11-18
title: "Bond issue screen shows what the market will fund"
summary: >-
  The issue bonds screen now tells you how much the bond market will actually
  fund right now, and warns when your request is larger than that.
tags: [bonds, corporations]
badges: [patch]
areas: [fullstack]
---

## What changed

- The credit and bonds tab shows the amount the bond market will fund today next to the legal limit.
- If the amount you enter is above what the market will fund, a note explains that only the funded part pays out now, the rest places slowly, and the cooldown still starts.
