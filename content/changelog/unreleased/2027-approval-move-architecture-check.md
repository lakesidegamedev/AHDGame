---
date: 2026-11-11
title: "Architecture check accepts the approval field move"
summary: >-
  The check that keeps old voter group wording out of the code now knows that
  the one-time move of saved approvals has to name the old saved field.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The startup step that moves saved character and party approvals onto census groups no longer fails the architecture check.
- Every other file still has to describe voters with census groups.
