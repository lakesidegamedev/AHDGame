/**
 * Olympics flavor event: country scope, no decision required. Host selection
 * happens BEFORE this handler runs in `driver.ts` (`offerGlobalHostCountryEvent`),
 * picked deterministically from a hash of the current turn. This handler only
 * applies the host's effects; no bidding, escrow, or multi-turn state.
 *
 * `sectorType: "media_entertainment"` stands in for tourism (no dedicated
 * `CorporationType` exists); `construction` is a real sector used as-is.
 */
import type { EventHandler } from "@/lib/events/substrate/types";
import { registerEventHandler } from "@/lib/events/substrate/registry";
import { applyDeclarativeEffects } from "@/lib/events/substrate/applyEffects";

const apply: EventHandler["applyEffects"] = async (ctx) => {
  await applyDeclarativeEffects(ctx, ctx.tier.effects);
};

registerEventHandler({
  kind: "worldEvents.olympics",
  defaultOptionId: "acknowledge",
  options: [
    {
      id: "acknowledge",
      label: "Host the Games",
      description: "The nation hosts the Olympic Games.",
      isDefault: true,
      outcomeTable: [
        {
          minRoll: 1,
          maxRoll: 100,
          label: "A successful Olympic Games",
          effects: [
            { type: "approvalDelta", delta: 6 },
            { type: "sectorDemandModifier", sectorType: "construction", pct: 8, durationTurns: 6 },
            {
              type: "sectorDemandModifier",
              sectorType: "media_entertainment",
              pct: 8,
              durationTurns: 6,
            },
            { type: "wireOnly" },
          ],
          newsWire: {
            category: "general",
            title: "{country} Hosts the Olympic Games",
            template:
              "The Olympic Games opened in {country} to international fanfare, drawing visitors and media attention from around the world. {leader} welcomed athletes and dignitaries at the opening ceremony.",
          },
        },
      ],
    },
  ],
  applyEffects: apply,
});
