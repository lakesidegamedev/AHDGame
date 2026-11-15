---
date: 2026-11-13
title: "Admin Dossier shows 'No character yet' instead of an error"
summary: >-
  The money-flow panel in the admin Dossier no longer shows a red error with a
  Retry button for a player who has not made a character yet.
tags: [admin, dossier]
badges: [patch]
areas: [frontend]
---

For a player with no character yet, the Dossier money-flow panel now says
"No character yet." A Retry button could never help there, so it is gone for
that case. Real load failures still show the error and Retry.
