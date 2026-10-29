export const partySlateContent = `# Party Slate

The Party Slate is a planning board where a party's chairs decide who should run in each state or regional race. A chair can put a player or a same-party NPP on a race, and the board shows how likely an NPP is to say yes and how the race itself is going. It does not enter anyone into an election for you: it is a coordination layer above the normal filing flow.

## How it works

1. **Open the board.** The national party page and each state or regional party page have a **Slate** tab. The national tab shows a country map for countries with map support. Click a state or region to list every race there that is open to the party. Presidential races are not on the board.
2. **Assign a candidate.** A chair picks a race and assigns either a player character or a same-party NPP. The assignment is tied to that race.
3. **A player is told, not filed.** An assigned player gets a notification naming who assigned them and in what role. The player still has to enter the race through the normal election flow. Slate never files a player for you.
4. **An NPP answers at the turn.** Before the turn, the card shows a prediction chip, **Likely to Accept** or **Likely to Decline**. When the turn runs, an NPP that enters the race shows **Accepted** and one that does not shows **Declined**.
5. **The assignment stays.** Assignments carry across turns, past election processing and into the next race cycle, until a chair changes or withdraws them, or the candidate files and the row becomes **Filed**.

Why it works this way: parties need to fill many races at once, but players choose their own campaigns and NPPs have personalities. Slate lets leaders express intent without overriding either.

### Key numbers

| Item | Value |
| --- | --- |
| Candidates one party can hold on a single race | 3, players and NPPs sharing the same 3 slots |
| NPP loyalty needed to accept | At least 40 |
| NPP stubbornness allowed | At most 70 |
| State or regional chair leeway | Loyalty need 5 lower (35), stubbornness ceiling 5 higher (75) |
| Cost to assign | None |
| Races covered | State, regional and legislative races. Not presidential races |

### What counts toward the 3 slots

| Takes a slot | Does not take a slot |
| --- | --- |
| An invited, accepted or filed Slate row | A declined or withdrawn row, which frees the slot |
| An NPP already running for the party in that race | A player who filed on their own |

A race that already holds more than 3 (for example from before the cap existed) is trimmed back by the next turn. The Slate card shows how many slots are used.

### Worked example

A state chair slates two NPPs in the same state race. NPP A has loyalty 38 and stubbornness 60. NPP B has loyalty 45 and stubbornness 72.

- For A, the baseline needs loyalty 40, so A would decline for a national chair. A state chair gets 5 points of leeway, so the need drops to 35 and A is **Likely to Accept**.
- For B, the baseline ceiling is 70, so B would decline for a national chair. The state chair's ceiling is 75, so B is **Likely to Accept** too.

Both fit within the 3 slots. If a third same-party candidate already stands in that race, the NPPs can still join and create a contested primary rather than pushing the existing entrant out.

## What you can do

- **Chairs and vice chairs.** The national chair and vice chair can assign for any race. A state or regional chair or vice chair can assign for races in their own state or region. Open the **Slate** tab on the national page or the state or regional party page. Both write to the same rows, so notes and assignments stay in sync.
- **Move a candidate within a state.** Assigning someone to a new race in the same state removes their older same-state rows. A compliant NPP is then withdrawn from the old race and filed into the new one at the next turn.
- **Withdraw an assignment.** This clears the row and frees the slot. The candidate can then be assigned to another race in that state.
- **Everyone else.** Other party members can view the board but cannot change it.
- **Players who are assigned.** Check the notification, then enter the race from the election screen if you want it.

**Tips.**
- Check the prediction chip before the turn. A Likely to Decline NPP will not file, so assign someone else or use [Party Actions](/wiki/party-actions) to raise its loyalty first.
- Let state leaders slate their own state. Their 5 points of leeway turn many borderline NPPs into acceptances.
- A declined row can show a reason, such as a cooldown, or that the race slate is already full.

**Common questions.**
- *Does Slate file me automatically?* No, not for players.
- *Why did my NPP decline?* It missed the loyalty or stubbornness test, was on cooldown, or the race already had 3 candidates from your party.
- *Can I use Slate for the presidency?* No.

## Connections

**Driven by**

- [Party Leadership](/wiki/party-leadership): only chairs and vice chairs can change the board.
- [NPP Behavior](/wiki/npp-behavior): an NPP's loyalty and stubbornness decide whether it accepts.
- [Party Actions](/wiki/party-actions): raising an NPP's loyalty or cutting its stubbornness changes the prediction.

**Affects**

- [NPP Elections](/wiki/npp-elections): accepted NPPs enter the race at the turn, even into a contested primary.
- [Primaries](/wiki/primaries): a slated NPP can create a contested primary against an existing entrant.
- [Political Parties](/wiki/political-parties): the board is part of how a party fields candidates.

## Status

Live in every world with a party system, for races other than the presidency. Assignments, the 3 slot limit and the acceptance test work the same in every country and era.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Exact rules and edge cases are on the [Party Slate design page](https://docs.lakesidegames.net/design/party-slate.html).

See also: [Party Organization](/wiki/party-organization), [Glossary](/wiki/glossary)
`;
