---
date: 2026-10-29
title: A failed cabinet appointment tells the nominee why
summary: >-
  When a Senate vote passes but the nominee cannot take the seat because they
  also hold a central bank office, the nominee is now told what happened and the
  appointment records the reason instead of looking like a lost vote.
tags: [cabinet, senate, central-bank]
badges: [patch]
areas: [backend]
---

## What changed

- A nominee is now notified when a cabinet appointment fails, whether the Senate
  voted it down or the seat could not be given because of a conflict of office.
  Previously only the president was told, so a nominee could find the seat empty
  with no explanation.
- The appointment record keeps the reason it failed: rejected at the vote, or
  rejected because chairing a central bank or holding a Federal Reserve board
  seat cannot be combined with a cabinet office.
- The president's notice now says when the vote passed but the seat could not be
  given for that reason, instead of reading as a simple defeat.
