---
date: 2026-11-09
title: "Seceded regions use their own census"
summary: >-
  When Scotland or Wales secedes, each new region keeps its own authored
  population make-up instead of a split layered on the old national voter
  groups.
tags: [secession, demographics, uk]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each region of a seceded Scotland or Wales already has its own age, education, income, ethnicity and urban-rural profile. Voting and polling there now rely on that profile alone.
- The old step that re-sliced the national voter-group split across the new regions has been removed. Every new region starts from a copy of the national record and the regional differences come from the census.
