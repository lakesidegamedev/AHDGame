# Impeachment filing protection and voting windows

Run: `npx tsx scripts/sim/impeachmentFilingProtection.ts`

Synthetic game-turn replay using the same portable filing-window rule as the API.
No production data or balance edits are involved.

| Scenario                                  | Filing eligibility                                  |
| ----------------------------------------- | --------------------------------------------------- |
| Win on turn 100                           | Blocked on turns 100 through 171; opens on turn 172 |
| Consecutive wins on turns 10, 100 and 200 | Latest win controls; opens on turn 272              |
| House articles filed on turn 172          | House deadline on turn 196                          |
| House passes on turn 196                  | Senate deadline on turn 220                         |
| Governor articles filed on turn 172       | Single conviction-stage deadline on turn 196        |

614 assertions cover all 101 turns from 100 to 200 for both offices under US,
Brazil and Nigeria scenarios, re-election boundaries, and both 24-turn constants.
The filing rule is country-independent; the existing presidential-system guard
continues to keep parliamentary governments on no-confidence procedures.

Integration tests verify country, office and state filtering, actual resolution-turn
precedence over scheduled close, and rejection of filings during the protection
window, including admin and NPP-sponsored filings. Existing open stages retain their
stored deadlines. New stages use 24 turns. The 48-turn refiling cooldown is unchanged.

The shell joins the target's recorded election-win career entries to completed
races and their resolution receipts in batches. It uses a scheduled end turn only
when an actual resolution turn is absent. Appointed or opening holders without a
recorded election win do not receive an invented election date.
