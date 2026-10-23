---
date: 2026-10-18
title: Public API exposes profile and corporation hero banners
summary: Public API consumers can now read the hero banner images shown on character profiles and corporation pages.
tags: [api, profiles, corporations]
badges: [patch]
areas: [backend]
---

- Character search, detail and bulk responses include `profileHeaderImageUrl`.
- Corporation detail responses include `headerImageUrl`.
- Both fields return the stored image URL, or `null` when no banner is set. Local upload paths remain relative to the game origin.
