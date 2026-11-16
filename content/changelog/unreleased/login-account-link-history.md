---
date: 2026-11-15
title: "Login accounts now leave a trail for alt detection and bans"
summary: >-
  Linking or unlinking Apple, Discord or Google sign-in is now recorded, banned
  players' login accounts stay blocked, and Apple sign-in skips the Discord
  requirement once per Apple account.
tags: [auth, alts, moderation, accounts]
badges: [minor]
areas: [fullstack]
---

## What changed

- Linking or unlinking Apple, Discord or Google sign-in is recorded as a one-way hash, never the real id. The record is removed when the account is deleted.
- Alt scoring now treats two accounts that used the same Apple, Discord or Google sign-in, now or earlier, as a strong match. Staff see "Shared Apple sign-in (now or earlier)".
- Banning a player also blocks their linked login accounts from being linked to or used to register another account. Unbanning lifts the block.
- Apple sign-in exempts a new character from the Discord linking requirement once per Apple account. If that Apple account was used on another account before, Discord linking is required, as for email accounts.
