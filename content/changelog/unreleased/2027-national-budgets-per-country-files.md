---
date: 2026-11-11
title: "Opening national budgets for 1953 and 1979 live in each country's folder"
summary: >-
  The authored 1953 and 1979 national budgets moved out of one giant file into
  each country's own folder. The numbers are unchanged.
tags: [engineering, economy]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up for people who work on the game's code. Every country's
opening budget for 1953 and 1979 now sits next to the rest of that country's
data, so changing one country no longer means digging through a 7,000 line
file. No player-facing numbers change.
