---
date: 2026-11-11
title: "A region's independence vote no longer fails on party recruitment slates"
summary: >-
  A region becoming a country could stall because several parties' recruitment
  slates for the same election were all relabelled independent.
tags: [referendum, parties]
badges: [patch]
areas: [engine]
---

## What changed

- When a region becomes its own country, recruitment slates belonging to parties that do not carry over are now retired along with their candidate lists, instead of all being relabelled as independent. That clash made the whole independence step fail and retry every turn.
- The party that moves to the new country keeps its slates under its new party number.
