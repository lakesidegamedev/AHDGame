---
date: 2026-11-10
title: "Automation levy is tracked on its own"
summary: >-
  The money collected from the automation tax and pension levy now has its own
  line in the national books, separate from import tariffs, and shows on the
  country budget page.
tags: [automation, tax, treasury, economy]
badges: [minor]
areas: [engine, backend, frontend]
---

## What changed

- Automation levy money is recorded as its own kind of treasury income instead of being mixed in with tariff revenue.
- The country budget page shows the yearly automation levy when a country collects one.
- The levy is shown for information. The cash reaches the treasury when it is collected, so it is not added to the revenue total a second time.
- Worlds that still use the older sector model no longer make inputs dearer for the levy. That model has no input purchases to take the levy from, so the law has no effect there.
