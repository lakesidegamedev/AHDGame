---
date: 2026-11-13
title: Account emails can be sent through a self-run mail relay
summary: >-
  Password reset, confirm-email and change-email messages can go through a
  mail relay the operator runs, instead of Resend. Nothing changes for players.
tags: [accounts, email, operations]
badges: [patch]
areas: [backend]
---

Set `SMTP_HOST` (and `SMTP_PORT` if it is not 25) to send account emails through a send-only mail relay on the app's private network. When `SMTP_HOST` is unset, Resend is used as before.
