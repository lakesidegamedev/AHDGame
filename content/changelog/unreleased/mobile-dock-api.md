---
date: 2026-11-02
title: The phone app can draw the game's own navigation bar
summary: >-
  The game now describes its phone navigation (Company, State, Nation, Actions,
  More and everything inside them) so the phone app can show it as its own
  native bar. Inside that app the website's bottom bar steps aside and the
  standard menu button stays, so every page is still one tap away.
tags: [mobile, ahdclient, navigation, ui]
badges: [minor]
areas: [fullstack]
---

## What changed

- The phone navigation tabs and their menus now come from one shared builder, so
  the website bar and the phone app always offer the same places in the same order.
- A new signed-in endpoint, `/api/mobile-dock`, returns that navigation for the
  player: tabs, the pages behind State, Nation and More, and the pixel icons, in
  the player's language.
- In phone app versions that draw their own bar, the website no longer draws its
  bottom navigation bar. The top menu button remains.
- Browsers, the desktop app and earlier phone app versions are unchanged.
