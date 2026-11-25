---
date: 2026-11-25
title: "Old ticket receipts are never sent late"
summary: >-
  A support ticket's "resolved" message is only delivered while the ticket is
  fresh. Receipts more than three days old are no longer sent.
tags: [support, discord]
badges: [patch]
areas: [backend]
---

When a ticket is resolved, the bot sends the reporter a short "your ticket has
been resolved" message. If that delivery kept failing, the receipt stayed queued
and could arrive weeks later, which reads as spam. The bot now only receives
receipts written in the last three days, and never one from before this change.
