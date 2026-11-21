---
date: 2026-11-21
title: "Inbox shows a clear message when a reply cannot be read"
summary: >-
  Opening mail or notifications no longer shows a garbled browser error when the
  server reply arrives damaged.
tags: [inbox, notifications]
badges: [patch]
areas: [frontend]
---

## What changed

- If the reply for your inbox, mail or notifications is not readable, the page now says so in plain words and lets you retry, instead of showing a raw parser error.
- Mail and notification replies were also affected by a compression fault that was fixed separately and is already live.
