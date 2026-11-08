---
date: 2026-11-08
title: "Shared code for repeated screens and lists"
summary: >-
  Folded copies of the same code into shared pieces across navigation menus,
  approval, election, legislature, chart and staff screens. Nothing changes for
  players.
tags: [frontend, maintenance]
badges: [patch]
areas: [frontend, backend]
---

The navigation menus, approval breakdowns, election result tables, party
election panels, no-confidence controls, portfolio and budget charts, US state
names and several staff tools each carried their own copy of the same code. They
now share one version. Screens, numbers and wording are unchanged.
