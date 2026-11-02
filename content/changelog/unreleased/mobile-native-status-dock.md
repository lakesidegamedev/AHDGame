---
date: 2026-11-02
title: The phone app can show the status bar inside its own dock
summary: >-
  When the phone app draws its own bottom dock with the status figures in it,
  the site leaves out its bottom status bar, so the phone shows one bar
  instead of two. Older app versions keep the site's status bar.
tags: [mobile, ahdclient, status-bar, ui]
badges: [minor]
areas: [frontend]
---

## What changed

- The site now recognises phone builds of the app that include their own
  status dock (they say so when they connect) and, for those only, does not
  draw its bottom status bar or reserve space for it.
- Browsers, the desktop app and earlier phone versions are unchanged.
