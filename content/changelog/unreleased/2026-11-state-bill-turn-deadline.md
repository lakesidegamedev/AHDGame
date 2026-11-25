---
date: 2026-11-25
title: State bills show their closing turn instead of "Expired"
summary: >-
  A state bill whose vote was still open could read "Expired" when the game
  clock ran behind real time. The bill page now shows the turn the vote closes.
tags: [legislature]
badges: [patch]
areas: [frontend]
---

## What changed

- The chamber vote and the veto override vote on a state bill page count down to the turn the vote closes, the same as national bills. They no longer read "Expired" while the vote is still open.
- The progress panel shows "Closes on turn N" instead of a calendar time that drifts when turns are paused.

Votes have always closed on the game turn. Only the display changed.
