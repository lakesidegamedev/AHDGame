---
date: 2026-11-11
title: "The US and UK law books are now plain data files"
summary: >-
  No change in play. The authored US and UK laws moved from code into data files
  that are checked when the game loads.
tags: [legislation]
badges: [patch]
areas: [backend]
---

Nothing changes in play. The 110 authored laws for each of the United States and
the United Kingdom are now stored as data files instead of code, with a shape
check on load and the existing rule validator in the tests. Editing a law no
longer means editing a five thousand line code file.
