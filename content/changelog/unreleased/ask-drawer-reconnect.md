---
date: 2026-11-03
title: Ask Keir recovers when the connection drops mid-answer
summary: >-
  If your connection drops or stalls while Ask is researching, the drawer now
  shows "Reconnecting..." and picks the finished answer up instead of freezing.
tags: [ask, interface]
badges: [minor]
areas: [frontend]
---

## What changed

- When the answer stream drops or goes quiet, the research card says "Reconnecting..." and checks every few seconds for the finished answer, for up to two minutes. When it arrives it shows as normal.
- If the answer never turns up, you get a plain message and a Retry button instead of a card stuck on "Researching".
