# Corporate transfer safeguards

The deterministic replay is `scripts/sim/corporateTransferSafeguards.ts`.
It uses synthetic accounts and balances only. Run with `npx tsx scripts/sim/corporateTransferSafeguards.ts`.

Twelve accounting scenarios cover US, UK and JP at explicit local/anchor conversion rates. A cash-only IPO shell with 20 million of cash and a 1 million offer previously delivered 19 million of net assets below cost. The protected minimum is 20 million, eliminating that acquisition gain. A private 5 million starter shell offered for 100,000 likewise has a 5 million minimum. Moving cash into securities leaves the minimum unchanged. An 18 million debt obligation against 20 million of assets reduces the minimum to 2 million, preserving debt-adjusted acquisition pricing.

Six age boundaries cover 0, 23, 24, 47, 48 and 49 turns. Transfers remain blocked until age 48. Corporation creation uses the same boundary except while the world's `preIteration.active` founding phase is true. That exemption does not waive transfer restrictions or the existing refounding cooldown.

This is an accounting and eligibility replay, not a whole-world economic forecast. Command tests additionally exercise actual balance-sheet loading, currency conversion, first-run rejection without money movement, and settlement retry/compensation behavior. Existing development already routes acquisition public-float proceeds back to an existing equity market pool, retaining treasury fallback only for legacy worlds without a pool.

Additional ownership safeguards: forced subsidiary mergers require the paid public float to be bought first (or the agreed-acquisition path, which pays that float). Direct shell mergers with investment holdings are refused until those positions are sold or transferred; subsidiary acquisitions preserve their assets. Privatization float payments now credit the equity pool rather than the company whose float is retired.
