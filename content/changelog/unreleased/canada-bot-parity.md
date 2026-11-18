---
date: 2026-11-18
title: Fix Canadian Discord bot government and province lookups
summary: >-
  Discord government lookups include Canada's cabinet and identify NPP ministers.
  Province lookups and election suggestions stay within the selected country.
tags: [discord, government, canada]
badges: [patch]
areas: [backend]
---

## What changed

- Read cabinet appointments for parliamentary governments as well as presidential ones, scoped to the requested country.
- Preserve NPP cabinet-holder labels in Discord responses.
- Accept canonical province ids and bare province codes within the selected country, return current office labels and working region links, and scope province officials and autocomplete results to that country.
