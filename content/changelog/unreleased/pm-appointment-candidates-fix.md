---
date: 2026-11-11
title: Prime minister and head of state appointment lists load again
summary: >-
  A code change during 1.20 testing broke the candidate lists for appointing a
  prime minister or head of state. They load again.
tags: [government, appointments]
badges: [patch]
areas: [backend]
---

## What changed

- The lists of members who can be appointed prime minister, or put forward
  for head of state, read the right player records again instead of failing.
- Five unreleased notes had invalid badge or area labels and now pass the
  changelog checks.
