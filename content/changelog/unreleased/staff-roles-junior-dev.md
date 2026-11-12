---
date: 2026-11-08
title: "New read-only staff role for junior developers"
summary: >-
  Admins can now give an account the junior dev role. It sees everything an
  admin sees, including logs and diagnostics, but cannot change anything.
tags: [admin, moderation]
badges: [minor]
areas: [fullstack]
---

## What changed

- A new staff role, junior dev, can open every admin and moderator tool in read-only mode. Every save, grant, ban, seed, heal, reset and turn control is refused by the server, not just hidden.
- Only admins can grant or remove the moderator and junior dev roles, and each change is recorded in the admin log.
- Junior devs get none of the moderator gameplay overrides. Moderator powers are unchanged.
- Full resets keep junior dev accounts, the same as other staff.
