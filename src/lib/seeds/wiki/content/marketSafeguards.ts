export const marketSafeguardsContent = `# Market Safeguards

One morning share prices go oddly flat, or oddly jumpy, with no news behind it. That can be the market safeguard at work. If the whole [stock market](/wiki/stock-market) collapses for no reason the underlying companies justify, the game steps the corporate economy back to an earlier, simpler model, so a broken market gets caught without anyone watching in real time. It works like a circuit breaker on a real exchange, and it matters to you because it can suddenly change how share prices and company revenue behave. There is no switch or panel for players.

## What it watches

Every turn the game adds up the market value of every corporation and compares it to a **reference value** taken on the first turn the newer market model was running. It also tracks what the companies are worth on their fundamentals, meaning their expected earnings ([Corporations](/wiki/corporations)) discounted by interest rates.

1. **Grace period.** For the first 5 turns after the reference is set, the safeguard does nothing. The new model needs a few turns of data before a drop means anything.
2. **Fair-value check.** After that it asks how far the market has fallen compared with what fundamentals justify. A fall that fundamentals explain, such as a central bank raising rates ([Central Banks](/wiki/central-banks)), is excused.
3. **Trip.** If the market is 25% or more below what fundamentals justify, the safeguard trips and steps the market model back one level.
4. **Stand down.** After a trip the safeguard switches itself off. It does not keep stepping down, and bringing back the newer model is a deliberate decision by the game's operators.

![Ladder of market models where a trip steps Plants back to Capital and Clearing or Capital back to Ledger, after which the safeguard switches itself off.](/wiki-images/diagrams/market-safeguards-model-ladder.svg)

Fundamentals can only make the safeguard more forgiving. They excuse a fall that a lower valuation justifies, but they never lower the bar. A fall that fundamentals do not explain counts in full, including a large market-wide swing in sentiment. A hard fall for real reasons, such as a rate hike or a genuine earnings collapse, goes through unchallenged.

| Item | Value |
| --- | --- |
| Drop that trips it | 25% below the fair-value reference |
| Grace period | 5 turns |
| Fundamentals trusted when | They cover at least 80% of total market value |
| Below that coverage | The raw fall from the launch value is used instead |

## Three bad days

The reference market value is 1,000 and fundamentals at that moment were also 1,000. Six turns later:

- The market falls to 700 and fundamentals have fallen to 800 because rates rose. Fair value is 800, so the drop is 1 minus 700 / 800 = 12.5%. That is under 25%, so nothing happens, even though the raw fall is 30%.
- The market falls to 700 and fundamentals are still 1,000. Fair value stays 1,000, the drop is 30%, and the safeguard trips.
- The market falls to 590 and fundamentals are 800. The drop is 1 minus 590 / 800 = 26.3%, so it trips even though rates explain part of the fall.

\`\`\`wiki-chart
market-guard-trip-line
\`\`\`

## After a trip

Nothing about your holdings, orders or company ownership is reversed. What changes is how prices and revenue are computed from then on, for every corporation at once, not just your portfolio. It also moves the world to an earlier market model, described in the [Market System Guide](/wiki/market-system-guide).

| Item | Value |
| --- | --- |
| Trip result from the Plants model | Back to the Capital model |
| Trip result from Clearing or Capital | Back to the Ledger model, which tracks flows without changing balance |
| After a trip | The safeguard switches itself off |

- From **Plants** back to **Capital**: sectors again earn revenue from invested capacity instead of from the plants they own. See [Plants Corp Guide](/wiki/plants-corp-guide).
- From **Clearing** or **Capital** back to **Ledger**: prices and output no longer pass through market clearing or capacity limits.

If prices went flat or oddly stable, the step back is a plausible reason; the market is not broken for you alone. If your corporation relies on Plants-model revenue, expect a different margin picture afterward, so keep plans flexible.

Watches worlds that run the Clearing, Capital or Plants market models; in a world on an earlier model there is nothing to watch. Last checked 2026-10-29, version 1.18.0. There is no separate technical page yet and the numbers above are the exact rules; for how share prices are computed, see [Stock Market (design)](https://docs.lakesidegames.net/design/stock-market.html)
`;
