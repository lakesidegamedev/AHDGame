export const cnOverviewContent = `# China

China is a **one-party state** with a non-democratic political system. The **Premier** leads the State Council through confidence of the 2,980-seat National People's Congress, but the **Chinese Communist Party (CCP)** is the ruling party by design. No-confidence votes are not available. The **President** is a ceremonial head of state, auto-populated as whoever currently holds the CCP chair. China is the world's second-largest economy.

---

## Government structure

| Office | How Filled | Term | Seats |
| --- | --- | --- | --- |
| Premier (head of government) | Internal party confidence | 5 years | 1 |
| President (ceremonial head of state) | Auto-populated as CCP chair | No fixed term | 1 |
| NPC Delegate | Regional election | 5 years | 2,980 (1,226 in 1953) |
| Provincial Delegate (People's Congress) | Sub-national election | 5 years | 4,000 total |
| Governor (provincial executive) | FPTP provincial election | 5 years | 1 per province |
| Governor of the PBoC | Appointed action | 5 years | 1 |

The **Premier** is China's head of government, the executive office that drives the State Council.

The **President** is a **ceremonial head of state**: not elected and not appointed through the Premier flow. The office is auto-populated as whoever currently holds the **CCP chair**, and updates automatically whenever the chair changes. The President carries **+0 actions per turn** and **0 party strength weight**, so the office has no mechanical weight beyond its ceremonial label.

---

## National People's Congress

The **National People's Congress** is the national legislature. Despite a bicameral name, it is **mechanically unicameral**: only the NPC participates in the player legislative loop.

- **National People's Congress (NPC)**: 2,980 delegates representing provinces, municipalities, autonomous regions, the armed forces, and special administrative regions. **5-year terms. All seats contested** each cycle. This is the sole legislative body where player-contestable bills originate.
- **CPPCC** (Chinese People's Political Consultative Conference): 2,169 members representing diverse social and economic constituencies. The CPPCC is an **advisory body** and is **not part of the player legislative loop**. It cannot block or amend bills.

The coalition threshold is **1,491 seats** (a bare majority of 2,980: 2980 / 2 + 1; 614 of 1,226 in the 1953 preset). Since the CCP is the ruling party by design and no other party competes, this threshold is a formality: the ruling party always holds the NPC majority.

---

## One-party constraints

China is one-party by design. These rules enforce it:

- **No-confidence votes.** The vote-of-no-confidence path is skipped entirely for China, not fired and rejected. The Premier cannot be removed by a legislative vote mid-term.
- **Single ruling party.** The CCP is the ruling party from the start of every world. Only one party can form government.
- **No snap elections.** The Premier cannot dissolve the NPC. Election terms are fixed at 5 years (240 turns, 10 real days).
- **Internal party confidence.** Leader transitions run through a separate model, and the game recomputes confidence every turn. It replaces the parliamentary confidence vote.

**Can a non-CCP player play?** Yes, with limits. Parties come in three tiers: *ruling* (the CCP), *approved* (such as the China Democratic League) and *banned*. An approved party can hold seats, run for legislative offices, vote on bills and sit in cabinet, but it cannot form government or field a Premier or Governor candidate. A party you create yourself starts **banned**: it cannot field candidates, vote or hold cabinet posts until the regime legalises it. See [One-Party States](/wiki/one-party-states).

---

## Internal party confidence

China was the first country modelled with a **ruling-party confidence model**, which every one-party state now shares. Instead of a legislative confidence vote, the CCP's internal dynamics drive leadership transitions:

- **Priority profile**: ideological weights that shift based on enacted policy.
- **Per-turn drift**: the game recomputes two scores every turn from policy effects, popular mood and the economy. **Popular legitimacy** is how the public reads the regime. **Party confidence** is how stable the ruling party is inside.
- **Leader confidence**: a new Premier starts at **75** out of 100, gains **5** on each renewal, and is capped at **95**.
- **Faction split**: at the third escalation stage (internal challenge), a split spawns the **"Democratic Faction of the CCP"** as a breakaway party. This is the only way a second party can emerge.

| Leader confidence | Band |
| --- | --- |
| 80 and above | Secure |
| 65 to 79 | Stable |
| 50 to 64 | Watchful |
| 35 to 49 | Strained |
| 20 to 34 | Crisis risk |
| Below 20 | Critical: leadership challenge or forced transition |

\`\`\`wiki-chart
cn-leader-confidence-bands
\`\`\`

### The four escalation stages

If the scores fall far enough for long enough, the regime moves through four stages. A single bad turn never moves it: each stage needs a stretch of turns in its zone.

| Stage | What happens | Trigger |
| --- | --- | --- |
| 1. Public discontent | Early warning, no immediate danger | Popular legitimacy at or below 60 for 12 turns |
| 2. Mass unrest | The leader chooses how to respond: concede, repress or distract | Popular legitimacy at or below 35 for 36 turns in a row, or 48 turns within a 168-turn window |
| 3. Internal challenge | The party splits and a breakaway faction appears | Party confidence below 15 for 24 turns |
| 4. Forced collapse | The regime falls and converts | Popular legitimacy below 15 for 72 turns |

**What can the leader do?** Liberalization reforms (legalize a banned party, reduce vote multipliers, hold an honest by-election, an anti-corruption purge, a constitutional amendment) trade party confidence for popular legitimacy. A purge can also be used against the party itself. In the 4th stage the leader can **accept** the conversion, or **resist**: that bans every approved party, costs 25 party confidence and 20 popular legitimacy, and delays the conversion by 48 turns.

The **President** is auto-synced to the CCP chair: when the party chair changes, the President updates to match automatically.

---

## Constitutional convention (regime conversion)

China uses the shared **regime-conversion** system used by every one-party state, with its own collapse target: a parliamentary republic.

| | Forced collapse (stage 4) | Voluntary convention |
| --- | --- | --- |
| Who decides | The collapse itself | The leader announces and negotiates it |
| Target | Parliamentary republic | Parliamentary republic or presidential. One-party is not an option, since conversion only runs one way |
| Seats kept by the former ruling party | 5% (3% if the leader resisted and legitimacy is still below 15) | 20% by default, up to 35% |
| Former ruling party's votes | Scaled down by 20% | No penalty |
| Time to the first election | 12 turns | 12, 24 or 48 turns (24 by default) |

Conversion, whether forced, negotiated through a convention, or imposed as a regime-change peace term, is one-way. Once converted, there is no path back, and the conversion dissolves the NPC and holds the election it promises.

---

## Provincial government

China is organized around **Provinces**. Each province has:

- A **Provincial People's Congress**: the sub-national elected legislature, totaling 4,000 delegates across all provinces. 5-year terms. Members vote on provincial legislation.
- A **Governor**: the provincial executive, directly elected. +2 actions/turn, 5-year term.

The provincial tier is mechanically analogous to US State Senates or UK Regional Councils, but with a CN-specific fiscal model.

### One-party regional budget

CN has a unique **two-source regional-budget model**: local tax retention plus central transfer grants:

| Knob | Value | Description |
| --- | --- | --- |
| Local tax retention share | 0.40 | Share of enterprise income tax (EIT) that stays local |
| Corporate profit ratio | 0.06 | Corporate profits as a fraction of regional GDP |
| Central transfer per capita | 35 (CNY/year; 2.77 in the 1953 preset) | Default central transfer pool per capita |
| Default tax rate | 25% | Fallback when no primary tax has been enacted |
| Primary tax | Enterprise Income Tax | Enterprise income tax legislation |
| Resource tax | Provincial Resource Tax | Optional per-region resource tax |
| Resource extraction ratio | 0.03 | Mining/oil/gas/water/salt as a fraction of regional GDP |
| Business tax consumption ratio | 0.50 | Consumption base for the standing Business Tax (营业税) |
| Business tax rate | 24% | Standing Business Tax rate (1991-era local tax) |

The **Business Tax (营业税)** was the dominant 1991-era Chinese local tax, replaced by VAT modernization over time. The **Enterprise Income Tax (EIT)** is the modern primary regional revenue stream, with 40% retained locally.

**Worked example.** A province with 50 million people gets a central transfer of 35 CNY per person per year, which is 1.75 billion CNY. A province with 100 billion CNY of GDP also has corporate profits of 6 billion CNY (0.06 of GDP). At a 25% EIT rate that is 1.5 billion CNY of tax, and the province keeps 40% of it: 0.6 billion CNY.

---

## How Chinese elections work

NPC and Provincial People's Congress elections use a CN-specific primary override:

- **Up to 7 CCP candidates may advance from each region's primary** (one-party states advance 7, parliamentary systems 3, presidential systems 1). The general election then shares seats across that caucus instead of collapsing to a single delegate per region.
- **All seats contested** in each cycle (no staggered classes).
- **5-year terms** for both NPC and Provincial People's Congress.
- **No snap elections.** Terms are fixed.

The 7-candidate primary override is the key CN electoral mechanic: it ensures the NPC reflects regional CCP caucus diversity rather than a single winner-take-all delegate per province.

---

## Key Chinese mechanics

**One-party by design.** The CCP is the ruling party from the start. No other party competes in elections. No-confidence votes are not available. The Premier cannot be removed mid-term by a legislative vote.

**Internal confidence, not legislative confidence.** Leadership transitions run through the internal-party confidence model shared by the one-party states, not a Dáil/Commons-style confidence vote. The priority profile and popular mood drive drift each turn.

**Ceremonial President auto-sync.** The President is not elected: the office auto-populates as whoever holds the CCP chair. When the chair changes, the President updates automatically.

**Regime conversion is one-way.** If ruling-party confidence collapses, a constitutional convention can convert China to a parliamentary republic or presidential system. There is no path back to one-party rule. The former ruling party retains a legacy seat reservation (3 to 35% depending on path).

**Party role labels.** CN uses localized party-role labels: chair → **"General Secretary"**, vice chair → **"Deputy General Secretary"**, committee → **"Secretariat"**. These override the default English labels.

**Party creation routes through a charter.** Founding a new party requires drafting a [Party Charter](/wiki/political-parties) co-signed by 3 human founders. CN requires 2 provinces (no locked home) and 1 NPP (a computer-run party) in each, so 2 NPPs spawn on creation. A new party starts banned (see above).

**Social axis baseline +3.5.** The social axis runs from socially liberal (−5) to socially conservative (+5). China starts at +3.5. Drifts toward the social stance of enacted national laws over time.

---

## Career path for Chinese players

| Stage | Target | Why |
| --- | --- | --- |
| Entry | NPC Delegate | +1 action/turn; national legislature access from the start |
| Parallel | Provincial Delegate | +1 action/turn; 5-year terms; provincial legislation |
| Mid-game | Governor | +2 actions/turn; controls provincial executive; 5-year term |
| Top | Premier | +4 actions/turn; heads State Council; internal-party confidence |

The Premier is the top of the ladder, but it requires internal-party confidence, not a legislative vote. The ceremonial President carries no mechanical weight (+0 actions, 0 party strength).

---

## Currency and economy

| Item | Detail |
| --- | --- |
| Currency | CNY |
| Central Bank | People's Bank of China (PBoC) |
| Chair title | Governor of the PBoC |
| Default prime rate | 4.0% |
| Stock exchange | SSE |
| Finance Minister | Minister of Finance |

### Economic model

China has **four seeded start years**: 1953, 1979, 1991, and 2019 (the default), each with its own authored national baseline and regional tilts:

| Era | Model | Description |
| --- | --- | --- |
| 1953 | Early command economy | First Five-Year Plan, Soviet-model industrialization, near-total illiteracy |
| 1979 | Barely-reformed command economy | Deng era opening: household responsibility system pilots, first SEZs, trade still minimal |
| 1991 | Agrarian | Pre-reform: a developing, largely agrarian/reforming economy |
| 2019 | Industrial powerhouse | Modern China: the world's manufacturing powerhouse |

A 2019-start China begins as an **industrial powerhouse** economy, the same model as Germany and Japan. A 1991-start China begins as agrarian and industrializes over time through play. Earlier starts (1953, 1979) begin further back in China's development arc, well before the reform-era opening. Sector-supported identities (e.g. **State-Capitalist**) emerge via the 67%+ state-ownership lever once the government actually nationalizes: sectors start unowned.

---

## Key China links

- [Cabinet Guide](/wiki/cabinet-guide): every cabinet post, its metrics, and its actions
- [Election Mechanics](/wiki/election-mechanics): Primary and general election rules
- [One-Party States](/wiki/one-party-states): the tiers, escalation stages, reforms and conversion
- [Multi-Country Play](/wiki/multi-country-play): One-party vs parliamentary vs presidential
- [Core Systems](/wiki/core-systems): Turn structure, action economy
- [Player Progression](/wiki/player-progression): Career ladder details
- [International Trade](/wiki/trade-system): CNY exchange, tariffs, FTAs

---

**Status:** China is playable in every era, with authored 1953, 1979, 1991 and 2019 starts. The escalation and conversion rules apply in every world. Last checked: 2026-10-29, version 1.18.0.

---

## Living history

The timeline below is written by the turn processor whenever a Premier transition or national-scope bill enactment happens in-game. Each entry is a real event from this save.

\`\`\`country-history
CN
\`\`\`
`;
