import type { CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import type { WarEmergencyResponseId } from "./warEmergencyResponse";

const WAR_EMERGENCY_TEMPLATE_KEY_BY_EVENT_KIND = {
  "worldEvents.panicBuying": "war_panic_buying",
  "worldEvents.bankRun": "war_bank_run",
  "worldEvents.civilDefenseFever": "war_civil_defense_fever",
  "worldEvents.warScareProtests": "war_scare_protests",
} as const;

export type WarEmergencyEventKind = keyof typeof WAR_EMERGENCY_TEMPLATE_KEY_BY_EVENT_KIND;
export type WarEmergencyTemplateKey =
  (typeof WAR_EMERGENCY_TEMPLATE_KEY_BY_EVENT_KIND)[WarEmergencyEventKind];

function ambientMargin(sectorType: string, value: number, label: string): CrisisEffect {
  return {
    effectType: "decay",
    targetType: "profitMargin",
    metricCategory: null,
    metricField: null,
    sectorType,
    strategyId: null,
    value,
    label,
    physicality: "financial",
  };
}

function option(
  optionId: string,
  label: string,
  description: string,
  response: WarEmergencyResponseId
) {
  return {
    optionId,
    label,
    description,
    effects: [],
    nextNodeId: "resolved",
    action: { kind: "warEmergencyResponse" as const, response },
  };
}

function template(input: {
  name: string;
  description: string;
  wireStart: string;
  wireEnd: string;
  ambientEffect: CrisisEffect;
  prompt: string;
  options: ReturnType<typeof option>[];
}): CrisisTemplate {
  return {
    name: input.name,
    description: input.description,
    scope: "country",
    countryIds: [],
    regionIds: [],
    durationTurns: 12,
    effects: [input.ambientEffect],
    wireMessageOnStart: input.wireStart,
    wireMessageOnEnd: input.wireEnd,
    interactionDefinition: {
      autoResolveOnExpiry: true,
      decisionTree: [
        {
          nodeId: "response",
          type: "choice",
          title: input.name,
          description: input.prompt,
          requiredRoles: ["headOfState"],
          timeLimitMinutes: null,
          options: input.options,
        },
        {
          nodeId: "resolved",
          type: "terminal",
          title: "Orders issued",
          description: "The government's emergency response is now in force.",
          requiredRoles: ["headOfState"],
          timeLimitMinutes: null,
          outcomeEffects: [],
          outcomeMessage: "The government has chosen its response.",
        },
      ],
    },
  };
}

export const WAR_EMERGENCY_CRISIS_TEMPLATES: Record<WarEmergencyTemplateKey, CrisisTemplate> = {
  war_panic_buying: template({
    name: "Wartime Panic Buying",
    description:
      "War fears have emptied the shelves as households hoard food, fuel and basic goods. Shops sell out within hours of a delivery. Retail margins take a large hit that fades over about 12 turns, and the government has to choose between appealing for calm, rationing and releasing stockpiles.",
    wireStart:
      "Panic buying has emptied the shops. People are queuing for bread and fuel as the war scare spreads.",
    wireEnd: "Deliveries are catching up and people are buying normally again.",
    ambientEffect: ambientMargin("retail", -4, "Hoarding and shortages disrupt retail trade"),
    prompt: "How will the government restore access to essential goods?",
    options: [
      option(
        "calm",
        "Appeal for calm",
        "Ask households to buy normally and accept the risk that confidence alone may fail.",
        "panic_calm"
      ),
      option(
        "ration",
        "Impose emergency rationing",
        "Curb consumer demand and recurring emergencies at a cost to Democratic Health.",
        "panic_ration"
      ),
      option(
        "release",
        "Release strategic stockpiles",
        "Spend public reserves to keep shelves supplied without broader emergency powers.",
        "panic_release"
      ),
    ],
  }),
  war_bank_run: template({
    name: "Wartime Bank Run",
    description:
      "Savers are lining up outside bank branches to take out cash because they fear the war will spread. Banks are running short of notes and have stopped lending. Margins across the economy take a hard hit that fades over about 12 turns. The government can reassure savers, guarantee all deposits or close the banks for a holiday.",
    wireStart:
      "Savers are queuing at bank branches to take out cash as war fears grow. Some branches are running short.",
    wireEnd: "The queues are gone and deposits are staying put.",
    ambientEffect: ambientMargin("financial", -8, "Deposit flight freezes credit markets"),
    prompt: "How will the government confront the run on the banks?",
    options: [
      option(
        "standBy",
        "Stand by the banks publicly",
        "Express confidence and let the financial system absorb the run.",
        "bank_stand_by"
      ),
      option(
        "guarantee",
        "Guarantee all deposits",
        "Commit the treasury to stop the run and buy limited relief.",
        "bank_guarantee"
      ),
      option(
        "holiday",
        "Declare a bank holiday",
        "Close banks by decree, suppress consumer demand, and damage Democratic Health.",
        "bank_holiday"
      ),
    ],
  }),
  war_civil_defense_fever: template({
    name: "Civil Defense Fever",
    description:
      "Families are digging shelters, stocking cellars and queuing for drills and leaflets. People are spending on bunkers and tinned goods instead of ordinary things, so consumer trade loses a large share of its margin, fading over about 12 turns. The government can order drills, fund a national shelter program or dismiss the panic.",
    wireStart:
      "Families across the country are stocking cellars and building shelters. Air-raid drills are packed.",
    wireEnd: "The shelter rush is fading and shops are selling ordinary goods again.",
    ambientEffect: ambientMargin(
      "retail",
      -18,
      "Preparedness spending sharply displaces consumer trade"
    ),
    prompt: "How far will the government mobilize the home front?",
    options: [
      option(
        "drills",
        "Order drills and leaflets",
        "Mobilize civil defense modestly, with a small cost to Democratic Health.",
        "civil_defense_drills"
      ),
      option(
        "fund",
        "Fund a national shelter program",
        "Spend heavily and shift demand from consumers toward construction and defense.",
        "civil_defense_fund"
      ),
      option(
        "dismiss",
        "Dismiss the panic",
        "Refuse to feed the fear and accept the political consequences.",
        "civil_defense_dismiss"
      ),
    ],
  }),
  war_scare_protests: template({
    name: "War Scare Protests",
    description:
      "Peace marches are filling the main squares as people fear the war will escalate. The crowds keep shoppers and workers away from city centers, so commerce loses margin that fades over about 12 turns. The government can let them march, address the nation or disperse the crowds.",
    wireStart: "Large peace marches are filling the squares and calling for restraint.",
    wireEnd: "The marches have thinned and the squares are back to normal.",
    ambientEffect: ambientMargin("media", -4, "Mass demonstrations disrupt city commerce"),
    prompt: "How will the government respond to the marches?",
    options: [
      option(
        "acknowledge",
        "Let them march",
        "Protect public dissent and accept the political pressure.",
        "protests_march"
      ),
      option(
        "address",
        "Address the nation",
        "Speak directly to public fear and buy a little breathing room.",
        "protests_address"
      ),
      option(
        "crackdown",
        "Disperse the marches",
        "Curb unrest and mobilize wartime industry at a severe cost to Democratic Health.",
        "protests_crackdown"
      ),
    ],
  }),
};

export function warEmergencyTemplateForEventKind(
  kind: string
): { templateKey: WarEmergencyTemplateKey; template: CrisisTemplate } | undefined {
  const templateKey = WAR_EMERGENCY_TEMPLATE_KEY_BY_EVENT_KIND[kind as WarEmergencyEventKind];
  if (!templateKey) return undefined;
  return { templateKey, template: WAR_EMERGENCY_CRISIS_TEMPLATES[templateKey] };
}
