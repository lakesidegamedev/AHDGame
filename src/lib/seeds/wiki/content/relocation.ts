export const relocationContent = `# Relocation

Moving house in this game costs you everything you built locally. Your home is a **state** (US), a **region** (UK nations, Japan, Ireland, China, Brazil, Nigeria and the bloc countries) or a **Land** (Germany, East Germany), and it decides where you can run, where campaigning is cheapest and which regional player list you appear in. The home you picked in [Create a Character](/wiki/create-a-character) is the one you can later move away from. A move is allowed, but it wipes your local political standing and clears your regional offices, so treat it as a planned reset, not a button to press casually.

## Pressing Relocate

1. Open the page of the state or region you want and press **Relocate here**.
2. The game checks the move is allowed (see the table and "When the button does nothing" below).
3. If the move would take you outside your [party's](/wiki/political-parties) reach, you are asked to confirm that you will become Independent.
4. The move resolves at once: local standing is wiped, regional offices are vacated, open candidacies are withdrawn, and a 72-turn cooldown starts.

**Why it works this way:** your Political Influence and donor network are earned in one place. Letting them follow you for free would make it painless to hop to the weakest race every cycle.

![What a move always resets, what resets only on a country change, what is kept, and the corporation branch for CEOs.](/wiki-images/diagrams/relocation-what-resets.svg)

| Rule | Value |
| --- | --- |
| Cooldown between moves | 72 turns (3 real days), shared by every kind of move |
| Political Influence after any move | 0 |
| Donor Base level after any move | 0 |
| National Influence after a move | Kept in your country, 0 if you change country |
| Moving a corporation with you, same country | 7% of its market cap |
| Moving a corporation with you, other country | 14% of its market cap (twice the base rate) |

\`\`\`wiki-chart
relocation-cooldown
\`\`\`

## What a move wipes, even within your country

- **Political Influence** goes to 0 in every state, and **Donor Base** level goes to 0 (the meters from [Stats & Actions](/wiki/stats-actions)), so **Fundraise is locked until you build a donor network again**. Group favorability for demographics is cleared too.
- **Regional party posts** (chair, vice chair, treasurer) in the state you left are vacated. Moving to a new state also starts a 24 turn wait before you can stand for state party leadership ([Party Leadership & Authority](/wiki/party-leadership-authority)).
- **Every open candidacy** (general, primary, party leadership, committee) is withdrawn, and a vacated seat gets a new race ([Election Mechanics](/wiki/election-mechanics)).
- **State and regional offices** such as governor, House, state senate and state legislature are resigned. The seat opens and a new race is created.
- **National offices** (President, Vice President, cabinet, chancellor) are **kept** on a move inside your country.
- **CEO roles** are removed, unless you use the combined move with your corporation (below). See [Corporations](/wiki/corporations).
- **Party membership** ends only if the destination is outside your party's reach. You get a warning first. Any party-join cooldown you already had still applies, and leaving does not start a new one. If you keep a national office after leaving the party, it shows as Independent.

## What only a change of country wipes

- **National Influence** and **Party Influence** go to 0, and you become **Independent**.
- **National party posts**, committee seats and any coalition chair are cleared.
- **Central Bank Chair** ([Central Banks](/wiki/central-banks)) and **national offices** are resigned.
- **Military commands** ([Military Commands](/wiki/military-commands)): a commissioned general leaves every command roster, gives up any command they led and hands units back to the old country. The move summary tells you if it cost you a command.
- Campaign manager roles, caucus seats and cabinet records tied to the old country are cleared.

After a cross-country move you start a political career from scratch. Your money, corporate holdings and personal history come with you.

## What you keep

Campaign Funds and Cash on Hand in every currency, savings, accumulated actions, Favorability, Infamy, policy positions, shares and bonds, credit balances, avatars, news posts, achievements and your earlier career history (a "relocated" entry is added). Your home state also sets your Campaign Funds income rate ([Core Systems](/wiki/core-systems)), and state and regional races are open only from your home ([Player Progression](/wiki/player-progression)). Money is not converted: ₳500,000 held in US dollars stays as US dollars after a move to the UK, and you earn the new currency from then on.

## Moving with a corporation

Press **Relocate here** on any state or region page you are eligible for. If you are a CEO, the button opens a three-choice dialog:

1. **Cancel**.
2. **Relocate & Abandon Corporation**: you move, and your CEO role is vacated. The board later appoints a replacement.
3. **Relocate & Move Corporation**: you and the corporation's headquarters move together and you stay CEO. It costs 7% of market cap, or 14% across countries. Imperial CEOs pay nothing.

The third option is greyed out if the corporation cannot afford the chosen payment method (not enough Liquid Capital, a bond cooldown, or the leverage cap). The other two stay available. A CEO must live in the corporation's headquarters state, so a plain move always costs you the CEO seat.

## When the button does nothing

- You moved less than 72 turns ago. The button counts down in hours or days.
- You picked your current home.
- The destination country is not open to players in this world.
- You have not yet confirmed the party warning.

Holding an office or running in a race does **not** block a move. Those are cleared for you.

## A move from Ohio to Michigan

You are a state legislator in Ohio with Political Influence 45, donor level 12, and a primary race open. You move to Michigan.

- Your Ohio seat is vacated, your primary candidacy is withdrawn, and Political Influence and donor level drop to 0.
- You keep your party if it operates in Michigan. National Influence is untouched.
- Rebuilding Political Influence from 0 to 40 with Campaign costs about 60 actions: 1 action per use below 20, then 2 per use from 20 to 39. At a state with average GDP per person that is roughly ₳1,360,000 in Campaign funds: 20 uses at ₳20,000, then 20 uses at ₳48,000.
- Rebuilding donor level 12 costs about 53 actions and ₳135,000 at average GDP.

That is more than a day of funds for most players, which is why the advice is to move right after a cycle ends, not before a primary.

## When to move

- **Move between cycles**, early in a build phase, so you have weeks to rebuild before the next primary.
- **Do not move to chase donor income** unless the gain is large. Per-level donor income is ₳100, ₳200, ₳400 or ₳800 for small, medium, large and mega states, so a small-to-large move multiplies it by four, but you start at level 0.
- **Cross-country moves are heavy.** Check the country is open to players before you commit.
- Pair a move with a party check: if the destination is outside your party's reach, plan to rejoin or switch.

Relocation works in every world; a destination country only appears if it is open to players in that world, and moving within your country is always allowed, subject to the cooldown. Last checked 2026-10-29, version 1.18.0. Exact rules: [Relocation (design)](https://docs.lakesidegames.net/design/relocation.html)
`;
