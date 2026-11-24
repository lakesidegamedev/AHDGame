---
date: 2026-11-24
title: "Elections list loads in about half the time"
summary: >-
  The elections list fetches every race's latest primary poll in one request
  instead of one per race.
tags: [performance, elections]
badges: [patch]
areas: [backend]
---

Building the elections list asked the database for each race's latest primary
poll separately, about 250 requests for the United States, and repeated some
bookkeeping for every race. It now gets all the polls in one request and does
the bookkeeping once, so the list is ready in about half the time. Nothing on
the page changes.
