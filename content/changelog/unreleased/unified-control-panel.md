---
date: 2026-11-08
title: "One control panel for admins, moderators and junior devs"
summary: >-
  The separate admin and moderator panels are now a single control panel. Each
  role sees only the tools it can use, grouped by area.
tags: [admin, moderation]
badges: [minor]
areas: [frontend]
---

## What changed

- The admin panel and the moderator panel are replaced by one control panel at `/control`. The menu groups tools by area (players, safety and access, content and community, support and reports, politics, world, economy, system, diagnostics) and only lists what your role can open.
- Every tool from both old panels is in the new one. Moderators keep exactly the tools they had; admins get all of them; junior devs see all of them read-only.
- A jump-to-tool search opens with Ctrl+K.
- Junior devs get a notice that their access is read-only, and changes are refused before they leave the browser as well as on the server.
- The Staff roles tool replaces the old Moderators tool. Admins use it to give and remove both the moderator and junior dev roles.
- The staff menu in the navbar now has a single Control Panel link.
