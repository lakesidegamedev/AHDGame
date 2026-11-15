import type { EventHandler } from "@/lib/events/substrate/types";
import { registerEventHandler } from "@/lib/events/substrate/registry";
import { applyDeclarativeEffects } from "@/lib/events/substrate/applyEffects";
import { packOutcomeTable, type PackEvent } from "../packTypes";

const apply: EventHandler["applyEffects"] = async (ctx) => {
  await applyDeclarativeEffects(ctx, ctx.tier.effects);
};

/** Register a code handler for every spec, generated from the same data as its definition. */
export function registerPackEvents(specs: readonly PackEvent[]): void {
  for (const spec of specs) {
    const defaultOption = spec.options.find((o) => o.isDefault);
    if (!defaultOption) throw new Error(`pack event ${spec.kind} has no default option`);
    registerEventHandler({
      kind: spec.kind,
      defaultOptionId: defaultOption.id,
      options: spec.options.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description,
        ...(o.isDefault ? { isDefault: true } : {}),
        ...(o.stat ? { primaryStat: o.stat } : {}),
        outcomeTable: packOutcomeTable(o),
      })),
      applyEffects: apply,
    });
  }
}
