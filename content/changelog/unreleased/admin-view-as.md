---
date: 2026-11-13
title: "Admins can preview the Control panel as a moderator or junior dev"
summary: >-
  A new "View as" switch in the Control panel shows an admin exactly which tools
  a moderator or junior dev can open, with a banner and one click back.
tags: [admin, control-panel]
badges: [patch]
areas: [frontend]
---

Admins get a "View as" switch in the Control panel top bar: Admin, Moderator or
Junior dev. The panel then shows only what that role can open, under a banner
that says "Viewing as Moderator. Your own admin access is unchanged", with a
button to go back. It only changes what is shown. The server still checks your
real role, and moderators and junior devs cannot preview a higher role.
