---
date: 2026-11-08
title: "Sign-in, character creation and poll endpoints split into focused modules"
summary: >-
  Discord, Google and Apple sign-in now share one flow, and character creation,
  polls and the regional economy view run from their own modules. Nothing
  changes in play.
tags: [maintenance]
badges: [patch]
areas: [backend]
---

Signing in or linking an account with Discord, Google or Apple, creating a
character, commissioning a poll and viewing a region's economy behave exactly as
before. The three sign-in paths now share one tested flow instead of three
near-copies, which makes future fixes to them safer.
