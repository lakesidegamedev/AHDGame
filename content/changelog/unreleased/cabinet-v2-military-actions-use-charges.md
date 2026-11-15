---
date: 2026-11-09
title: Recruiting and upgrading units now spend the charges your office shows
summary: >-
  In Cabinet v2 countries, recruiting a unit, upgrading a unit or issuing an
  order now spends one of the action charges shown in your office header.
tags: [cabinet, military]
badges: [patch]
areas: [backend]
---

## What changed

- The office header showed your Cabinet action charges (for example 4 of 4),
  but recruiting and upgrading units drew from an older balance that could
  already be empty, so the button refused with "No ministerial actions
  remaining" while the header said otherwise.
- In countries running the new Cabinet, those actions now spend one charge from
  the same pool the header shows, and charges recharge as before.
- Other countries are unchanged.
