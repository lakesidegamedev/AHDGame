---
date: 2026-11-07
title: "Countries run by the AI government can now hit a sovereign debt crisis"
summary: >-
  Countries not open to players and run by AI governments were never counted
  as AI-governed on the newest autonomy settings, so their failed bond
  auctions were ignored and debt crises never started. They now count.
tags: [economy, bonds, government]
badges: [patch]
areas: [engine]
---

## What changed

- On worlds running the two newest AI government levels, countries closed to players were not recognised as being run by an AI government.
- Because of that, a country deep in debt could fail every bond auction for years without its failed-auction count moving, so no sovereign debt crisis ever began and nothing forced a response.
- These countries are now recognised correctly. Three failed auctions in a row start a sovereign debt crisis, and the AI head of government responds through the existing crisis choices.
- The same fix lets players browse the political pages of those countries read-only again, as intended.
- Countries still need very high debt (at least twice their GDP) before an AI-run country can enter a crisis. Player countries are unchanged.
