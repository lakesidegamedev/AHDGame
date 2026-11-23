---
date: 2026-11-23
title: "Computer politicians no longer get real politicians' names"
summary: >-
  The name generator for computer-run politicians now skips the names of real politicians and notorious
  political figures.
tags: [npp, names]
badges: [patch]
areas: [backend]
---

## What changed

- Computer-run politicians get a random first name and surname. That could land on a real person, as it did with a senator named after a real former Klan leader. The generator now checks a list of real politicians and notorious figures and picks again on a match.
