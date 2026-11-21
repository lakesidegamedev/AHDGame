---
date: 2026-11-21
title: "Corporation pages load again"
summary: >-
  Fixed corporation pages showing an error instead of the company.
tags: [corporations]
badges: [patch]
areas: [fullstack]
---

## What changed

- Opening a corporation page could fail with a generic error because the company data arrived in a form the page could not read. It now arrives in a readable form and the page loads normally.
