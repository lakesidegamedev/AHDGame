---
date: 2026-11-03
title: Organisation screens match who can act
summary: >-
  A head of government without the foreign affairs seat no longer sees
  organisation buttons that would be refused.
tags: [diplomacy, ui]
badges: [patch]
areas: [frontend]
---

## What changed

- Only the foreign minister can act for a country in international
  organisations. A head of government who does not hold that seat still saw
  join, leave, vote, posture, fund and create controls, and every one of them
  was refused.
- Those controls are now hidden for them, and the diplomatic action counter
  follows the foreign minister. They still see their own country's delegation
  read-only. Controls for an organisation they lead are unchanged.
- No game rules changed.
