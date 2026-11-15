---
date: 2026-11-12
title: "Game actions need VPN access from staff"
summary: >-
  Players connected through a VPN can still sign in and manage their account,
  but cannot take game actions unless staff have allowed VPN access.
tags: [moderation]
badges: [patch]
areas: [backend, frontend]
---

## What changed

- If you are connected through a VPN, a banner explains that game actions are paused until you turn it off.
- If you need a VPN, open a Discord ticket and staff can allow VPN access for your account.
- iCloud Private Relay is not treated as a VPN.
- The privacy policy now explains that we store IP addresses and check for VPNs to stop multi-accounting.
