---
date: 2026-11-09
title: Leaving office now leaves a legacy that colours the next election
summary: >-
  When a head of government leaves office, the game scores their time in power
  from approval, laws enacted, how they handled crises and what those crises
  scarred. The legacy shows on the executive and party pages, and gives their
  party a small, fading boost or penalty at the next election and in party
  renewal.
tags: [politics, elections, parties, crisis]
badges: [minor]
areas: [frontend, backend]
---

## What changed

- When the head of government changes (term end, succession, resignation or
  removal), the departed leader gets a legacy score from -100 to 100. Approval at
  exit counts for 40%, crisis credit and blame for 30%, laws enacted for 20% and
  crisis scars for 10%. Terms under 24 turns count proportionally less.
- The legacy appears on the country executive page and on the leader's party
  page, with the numbers behind it and how much of its effect is left.
- It gives the leader's party a vote-share shift of up to 2 points and a shift of
  up to 5 points in the approval that party renewal sees for a governing party.
  Both halve every 96 turns and stop after 288, and the election shift is bounded
  together with crisis credit and blame at 3 points.
- A line goes to the news feed when a leader with a real term leaves.
