---
date: 2026-10-23
title: Continue with Discord now sends the redirect host the app registers
summary: >-
  Sign-in sent Discord a www address while the Discord application registers the
  apex, so Discord answered Invalid OAuth2 redirect_uri before the consent
  screen. The app now sends the registered apex and both legs of the exchange
  agree.
tags: [accounts, sign-in]
badges: [patch]
areas: [backend]
---

## What changed

- The Discord authorize request and the token exchange both read one helper, so they can never send different redirect addresses.
- A www host is rewritten to the apex, which is the address the Discord application registers.
- Local development and apex deployments are unchanged.
