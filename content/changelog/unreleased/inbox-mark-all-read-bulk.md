---
date: 2026-11-08
title: "Inbox Mark all read works on long lists"
summary: >-
  Mark all read now clears a long unread list in a couple of requests instead
  of one per item, so big inboxes no longer fail to clear.
tags: [inbox, notifications, mail]
badges: [patch]
areas: [fullstack]
---

- Mark all read sends one request for notifications and one for mail, instead of one per item, so a long unread list no longer trips the per-minute request limit.
- Notifications and mail each accept a list of ids for marking read in a single request, capped at 100 per request. The inbox splits longer lists automatically.
- If the server still asks the inbox to slow down, a short wait is retried once; a longer wait shows "Too many requests right now" instead of a generic failure, and the unread state is restored.
