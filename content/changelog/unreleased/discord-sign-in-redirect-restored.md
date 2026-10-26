---
date: 2026-10-26
title: Continue with Discord signs you in again
summary: >-
  Discord sign-in and sign-up answered Invalid OAuth2 redirect_uri since the
  1.18.0 release. The game sent Discord a return address it does not have on
  file. It now sends the registered address again.
tags: [accounts, sign-in]
badges: [patch]
areas: [backend]
---

## What changed

- Continue with Discord works again for sign-in, sign-up and account linking.
- The Discord return address is sent exactly as configured instead of being rewritten.
