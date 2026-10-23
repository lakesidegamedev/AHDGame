---
date: 2026-10-23
title: Spin-offs now warn about the seven day cooldown and count it down
summary: >-
  Spinning off a subsidiary silently locked you out of another one for 168
  turns. The spin-off dialog now says so before you commit and shows the
  remaining turns while the cooldown runs.
tags: [corporations, subsidiaries]
badges: [patch]
areas: [frontend]
---

## What changed

- The spin-off dialog warns that a spin-off starts a 168 turn cooldown, about a week, before you commit.
- While the cooldown runs, the dialog shows how many turns are left and disables the spin-off button instead of letting the request fail.
- The cooldown itself is unchanged at 168 turns, and the server and the page count it down from the same helper.
