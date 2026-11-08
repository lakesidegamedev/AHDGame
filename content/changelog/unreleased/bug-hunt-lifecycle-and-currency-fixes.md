---
date: 2026-11-08
title: Party budget estimates now match treasury currency; several stuck items close properly
summary: >-
  Parties outside the US budgeted turnout and registration spending against
  the wrong currency unit, so percent sliders spent far too little or too
  much. Defence orders whose factory or company vanished, proposals whose
  party was deleted, and stale takeover offers now reach a closed state.
tags: [economy, parties, corporations, elections]
badges: [patch]
areas: [engine]
---

## What changed

- Party percent budgets (turnout, suppression, registration) estimated
  per-turn income in anchor units while treasuries hold local campaign money,
  so non-US parties spent the wrong share of income — far too little in
  high-denomination currencies like JPY and NGN, too much where the local
  rate is under 1. Estimates now use the same conversion and population base
  as the deposits.
- A defence contract whose supplier plant or company no longer exists is
  torn up for cause, releasing its held budget and quota instead of stalling
  forever.
- A committee proposal whose party was deleted, or a merge proposal whose
  target party was deleted, now lapses instead of staying open and blocking
  new proposals.
- Takeover offers past their expiry turn are stamped expired and stop
  showing as pending in the Deals view.
- Czechoslovakia's Chamber of Nations office key joins the multi-seat set
  with its siblings.
- One poisoned primary race or corporation vote can no longer abort the
  whole batch for that turn; a failed bond phase no longer silently
  vanishes the federation compensation phase; and a finished defence
  contract no longer keeps its plant out of off-type sales.
