---
date: 2026-10-30
title: ASCII page decode in experimental features
summary: >-
  Experimental features now includes an ASCII page decode. With the setting on,
  each page scrambles into place through a character grid as you move around
  the site.
tags: [ui, settings, experimental]
badges: [patch]
areas: [frontend]
---

Turning on experimental features in Settings now decodes page content with an
ASCII character grid each time you open a new page. Content keeps its real
position on the page while the glyphs are drawn over it, so nothing shifts, and
the text is still readable by screen readers and search engines while it lands.
Players who ask their device for reduced motion get a short fade instead.

The effect starts with your next page rather than the one you are on, and it
never runs on the sign-in, banned or marketing pages. Turning experimental
features off removes it immediately.
