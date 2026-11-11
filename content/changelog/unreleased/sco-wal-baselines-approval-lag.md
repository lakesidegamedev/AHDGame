---
date: 2026-11-11
title: "Scotland and Wales get campaign cost baselines, and one country's late approval data no longer stops a turn"
summary: >-
  Scotland and Wales now have campaign income and cost baselines, and a turn no
  longer fails when one country's approval data is a turn behind the others.
tags: [campaigns, approval]
badges: [patch]
areas: [engine]
---

## What changed

- Scotland and Wales now have their own campaign cost baselines, so campaign income and action costs can be worked out for their players instead of stopping the turn.
- A country whose approval data is one turn behind is now judged on its own data, not compared with other countries, so it no longer stops the turn for everyone.
- Approval data that is partly refreshed within one country is still refused.
