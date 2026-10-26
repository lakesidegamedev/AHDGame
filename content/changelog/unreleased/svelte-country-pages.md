---
date: 2026-10-26
title: Country pages load about half as much code
summary: >-
  Country overview, map, parties and economy pages now download roughly half
  as much code or less, and the mobile menu loads when you open it.
tags: [performance, mobile, frontend]
badges: [patch]
areas: [frontend]
---

## What changed

- Country pages no longer download the full country rulebook and cabinet
  tables to show one office title.
- The country map stops shipping the full commodity and sector tables, and
  the planned economy panels load only when shown.
- The mobile menu loads the first time you open it.
