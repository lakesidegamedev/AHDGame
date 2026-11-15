---
date: 2026-11-15
title: "Error reports can be matched to your support ticket"
summary: >-
  When the game hits an error in your browser, the report now carries an
  anonymous account id and the pages and requests just before it, so staff
  can find your exact error from a ticket.
tags: [errors, support, privacy]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- Error reports include your anonymous account id, character id and country. Names, usernames, emails and IP addresses are still never sent.
- Error reports keep the page paths you visited and the game requests made just before the error, with their result codes. Search terms, form contents and anything after a "?" in an address are removed.
- Staff can look up the errors from your account around the time you describe in a ticket, instead of asking for a reference code.
