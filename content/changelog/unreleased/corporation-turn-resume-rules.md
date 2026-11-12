---
date: 2026-11-12
title: "Groundwork for resuming an interrupted company turn"
summary: >-
  Adds the rules and a switch for safely resuming a company turn that was
  interrupted partway. Nothing changes for players while the switch is off.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- Added a turn resilience switch, off by default.
- Added the rules that decide whether an interrupted company turn can resume and that stop a retried payment from applying twice.
