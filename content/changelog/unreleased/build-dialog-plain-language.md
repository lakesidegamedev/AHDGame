---
date: 2026-11-17
title: "Clearer build dialog on phones"
summary: >-
  The Expand sector dialog now uses plain wording, a readable demand table at
  phone width, and shows keyboard tips only where there is a keyboard.
tags: [corporations, ui]
badges: [patch]
areas: [frontend]
---

## What changed

- The buyer demand table has spaced, right-aligned columns (Ordered, Delivered, Still open, Buildings needed) and long product names wrap instead of being cut off.
- Internal wording such as "funded", "unfilled" and turn numbers is gone from the dialog.
- Shift and Ctrl tips for the quantity box only show on devices with a mouse and keyboard.
- Automatic sizing messages say what to do next in plain language.
