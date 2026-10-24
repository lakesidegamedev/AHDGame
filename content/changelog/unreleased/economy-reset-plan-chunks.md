---
date: 2026-10-24
title: Economy rebuild tool handles full-size worlds
summary: >-
  The admin tool that rebuilds companies and markets now stores its reviewed
  plan in parts, so it works on worlds of any size. No gameplay change.
tags: [admin, economy]
badges: [patch]
areas: [backend]
---

- The reviewed plan for an economy rebuild is now saved in several parts and checked when it is read back, so a large world no longer stops the tool before it starts.
- The tool now reports how long each step takes.
