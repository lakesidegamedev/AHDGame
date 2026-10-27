---
date: 2026-10-27
title: Party organization moves faster
summary: >-
  Each Build Org click now counts a third more, and organization a party stops
  tending starts fading sooner and fades faster.
tags: [elections, parties, balance]
badges: [patch]
areas: [backend]
---

## What changed

- A Build Org click now adds 1.33 units to your party's regional pile instead
  of 1, so every click moves your Org share about a third further.
- A party that stops building Org in a region now starts losing it after three
  days instead of four.
- Once it starts, that fade is a third faster: about 27% of the pile per day
  instead of about 21%.
- Existing Org piles are unchanged. Today's percentages stay where they are.
