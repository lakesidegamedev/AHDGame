---
date: 2026-11-19
title: "Elections that get interrupted while counting now recover on their own"
summary: >-
  If the server stopped partway through resolving an election, that race could
  stay marked as being counted and its seat could stay empty. A stuck count is
  now picked up again on a later turn, and a retry no longer repeats
  career entries, notifications or seat clean-up.
tags: [elections, reliability]
badges: [patch]
areas: [backend]
---

## What changed

- An election being counted now holds a time-limited claim. If the process dies, the claim expires after 30 minutes and the next turn finishes the count.
- Retrying a count no longer adds a second "elected" or "lost election" entry to a career, and no longer sends the win or loss notification again.
- A retry no longer removes an extra long-serving senator or councillor from a chamber that is still filling its classes.
- By-election winners are no longer seated twice when a count is retried.
