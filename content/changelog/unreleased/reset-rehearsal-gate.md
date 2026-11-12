---
date: 2026-11-12
title: "A rehearsal command checks a world reset before it goes live"
summary: >-
  A new command resets a throwaway world and fails on incomplete steps and
  implausible starting figures, such as incomes left in an old currency.
tags: [engine]
badges: [patch]
areas: [backend]
---

## What changed

- The rehearsal command runs the full reset on a local test database and fails if any step was skipped or partly failed.
- It checks starting budgets, central banks, incomes, growth, parties, companies, seats and money totals for every country.
- It can also play one turn and fail if any phase breaks.
- It refuses to run against anything except a local database named for rehearsal.
