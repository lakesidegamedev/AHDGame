---
date: 2026-11-08
title: "United Kingdom code consolidated and server settings centralised"
summary: >-
  Behind-the-scenes cleanup. The United Kingdom's game rules now live in one
  place, and server settings are read through a single module. Nothing changes
  in the game.
tags: [maintenance, countries]
badges: [patch]
areas: [backend]
---

## What changed

- All United Kingdom rules (cabinet, leadership, conference, manifestos, by-elections and confidence) now sit together with the rest of the country's code. Gameplay is unchanged.
- Server settings such as sign-in providers, storage and turn tuning are now read in one place, which makes misconfiguration easier to spot. No setting names or defaults changed.
