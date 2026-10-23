---
date: 2026-10-23
title: The share price chart now colours its own span and says how long it is
summary: >-
  A share price chart that rose over eighteen turns could be drawn red because
  the last turn ticked down, since the line borrowed the previous-turn colour.
  The line now takes its colour from its own window and names that window.
tags: [corporations, accessibility]
badges: [patch]
areas: [frontend]
---

## What changed

- The masthead price line is coloured by the change across the turns it actually draws, not by the previous turn alone.
- A flat line is drawn neutral instead of green.
- The span, its change, and the low and high are labelled on phones as well as large screens.
