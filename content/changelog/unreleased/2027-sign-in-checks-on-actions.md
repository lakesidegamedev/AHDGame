---
date: 2026-11-08
title: "Automatic check that every game action needs a sign-in"
summary: >-
  A new automated check confirms that every action that changes the game
  requires the right sign-in, so a future change cannot quietly open one up.
  Nothing changes for players.
tags: [security, maintenance]
badges: [patch]
areas: [backend]
---

Every request that changes something in the game, from casting a vote to
buying shares, is now checked automatically before new code ships to make sure
it asks who you are first. The few actions that must work while signed out,
such as logging in, creating an account or resetting a password, are listed and
reviewed one by one. No gaps were found and gameplay is unchanged.
