---
date: 2026-11-13
title: Only admins can grant resources
summary: >-
  Granting money or actions to players now requires an admin on the server, as
  the Control panel already showed.
tags: [security, admin]
badges: [patch]
areas: [backend]
---

## What changed

- The resources grant endpoint now checks for an admin. Moderators and junior
  devs receive a refusal, matching what the Control panel already showed them.
