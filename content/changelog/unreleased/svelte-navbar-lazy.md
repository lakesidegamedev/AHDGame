---
date: 2026-10-26
title: Menus and the corporation page load faster
summary: >-
  Navigation menus, search and pop-ups now load when you open them instead of
  with every page, and the corporation page sends about a quarter less code.
tags: [performance, mobile, frontend, corporations]
badges: [patch]
areas: [frontend]
---

## What changed

- The navigation menus, search, profile switcher and notification preview
  load the first time you open them, starting as soon as you hover or focus
  them so they are usually ready by the click.
- The corporation page loads its national view, legacy product projects and
  CEO settings only when they are shown.
