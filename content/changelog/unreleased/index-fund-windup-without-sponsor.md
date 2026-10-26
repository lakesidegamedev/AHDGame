---
date: 2026-10-26
title: A fund can finish winding up after its sponsor corporation is gone
summary: >-
  A fund whose sponsoring corporation was dissolved during wind-down used to
  warn every turn and never finish. It now closes, and any cash with no sponsor
  left to pay it stays on the closed fund and is marked unclaimed.
tags: [index-funds, wind-up, turn]
badges: [patch]
areas: [engine, backend]
---

## What changed

- When a winding-down fund reaches the end and its sponsoring corporation no
  longer exists, the fund now closes and delists instead of failing every turn.
- Cash left with no sponsor to receive it stays on the closed fund and is
  recorded as unclaimed in the fund's history. Nothing is paid out to a
  different owner and nothing is destroyed.
