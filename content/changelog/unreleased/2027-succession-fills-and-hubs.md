---
date: 2026-11-09
title: "Successions now fill themselves"
summary: >-
  When a national leader's office stays empty past its acting period, the game
  now holds the election or vote that fills it, and presidential pages show who
  is acting.
tags: [elections, government, 2027]
badges: [patch]
areas: [engine, backend, frontend]
---

## What changed

- France, Romania and Russia (2027) now hold a special presidential election when the presidency stays vacant after the prime minister's acting period. If nobody files, a candidate from the previous president's party stands, so the office is not left empty.
- Where a legislature or ruling party picks the leader, the largest bloc in the legislature now chooses one of its own members once the acting period ends.
- Presidential pages show who is acting, what fills the office next, and whether the succession is overdue. They also say when a government is in caretaker mode.
- A test now checks that every country in every era has a succession rule, so a new country or government type cannot ship without one.
