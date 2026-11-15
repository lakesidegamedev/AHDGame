---
date: 2026-11-11
title: "Election, bill, campaign and government records get shared front doors"
summary: >-
  Behind the scenes, every read and write of election candidate, vote tally,
  bill, campaign, party organisation, crisis, coalition and similar records now
  goes through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Politics behaves exactly as before. Database access for each of these record types now lives in one place, and an automatic check stops new code from reaching around it, which makes bugs easier to find and prevent.
