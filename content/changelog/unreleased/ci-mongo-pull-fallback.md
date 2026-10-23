---
date: 2026-10-23
title: CI survives a Mongo image mirror outage
summary: >-
  The federation qualification job now retries its Mongo image pull and falls
  back to Docker Hub when the mirror is unreachable. No gameplay change.
tags: [ci]
badges: [patch]
areas: [backend]
---

## What changed

- The `federation-transactions` job retries the `mirror.gcr.io` Mongo pull
  three times, then pulls the same image from Docker Hub. A mirror outage on
  2026-10-23 failed the job twice in a row and blocked a promotion.
