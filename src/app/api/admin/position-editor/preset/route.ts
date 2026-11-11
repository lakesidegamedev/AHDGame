import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import type { Layer1Config } from "@/lib/seeds/stateDemographics";
import {
  editorConfigFromSeed,
  editorConfigFromCountryModel,
  applyOverrideToEditorConfig,
} from "@/lib/positionEditor/derive";
import { computeDerivedComposition } from "@/lib/positionEditor/preview";
import { stateCensusData } from "@/lib/seeds/stateCensusData";
import { stateCensusData1953 } from "@/lib/seeds/stateCensusData1953";
import { stateCensusData1979 } from "@/lib/seeds/stateCensusData1979";
import { stateCensusData1991 } from "@/lib/seeds/stateCensusData1991";
import { stateCensusData1999 } from "@/lib/seeds/stateCensusData1999";
import { stateCensusData2007 } from "@/lib/seeds/stateCensusData2007";
import { stateCensusData2023 } from "@/lib/seeds/stateCensusData2023";
import { stateCensusData2027 } from "@/lib/seeds/stateCensusData2027";
import { loadEraFullOverride, loadFullOverride } from "@/lib/seeds/loadEraPositionOverride";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import type { EraId } from "@/lib/seeds/presetSelector";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

// Load era census bundles DIRECTLY (not the in-memory stateCensusDataByEra map,
// which is only populated for 2019 at module init — empty for other eras on a
// fresh server). This mirrors how runCoreSeed selects its census bundle.
const ERA_CENSUS: Record<EraId, Record<string, Layer1Config>> = {
  // 1953: 1979 shares proxy with the 1979-authored positions blocks stripped.
  "1953": stateCensusData1953 as unknown as Record<string, Layer1Config>,
  "1979": stateCensusData1979 as unknown as Record<string, Layer1Config>,
  "1991": stateCensusData1991 as unknown as Record<string, Layer1Config>,
  "1999": stateCensusData1999 as unknown as Record<string, Layer1Config>,
  "2007": stateCensusData2007 as unknown as Record<string, Layer1Config>,
  "2019": stateCensusData as unknown as Record<string, Layer1Config>,
  "2023": stateCensusData2023 as unknown as Record<string, Layer1Config>,
  "2027": stateCensusData2027 as unknown as Record<string, Layer1Config>,
};

// GET /api/admin/position-editor/preset?era=2019&country=US
// Returns baseline editor config + derived lean per state for the country/era.
// Auth: requireAdmin
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const era = (searchParams.get("era") ?? "2019") as EraId;
    const country = (searchParams.get("country") ?? "US").toUpperCase();

    // Validate era up front so the international path (which would otherwise
    // pass an arbitrary string to getCountryLayer1Model and return an empty
    // states list, indistinguishable from "no model") rejects with a 400.
    if (!(era in ERA_CENSUS)) {
      return errorResponse(400, "Unknown era");
    }

    if (countryHasFeature("usApi", country)) {
      const bundle = ERA_CENSUS[era];

      // Load the full DB override for this era (US only) so the editor reloads
      // authored positions and baseline turnout.
      const override = await loadEraFullOverride(era);

      const states = Object.entries(bundle).map(([stateId, cfg]) => {
        const editor = editorConfigFromSeed(stateId, country, era, cfg);
        if (override) applyOverrideToEditorConfig(editor, override);

        const derived = computeDerivedComposition(editor);
        return {
          stateId,
          config: editor,
          lean: {
            economic: derived.stateEconomicLean,
            social: derived.stateSocialLean,
            display: derived.stateDisplayLean,
          },
        };
      });

      return NextResponse.json({ era, country, states });
    }

    // International country path
    const model = getCountryLayer1Model(country, era);
    if (!model) {
      return NextResponse.json({ era, country, states: [] });
    }

    // Load the full DB override for this country+era so the editor reloads
    // authored positions and baseline turnout.
    const intlOverride = await loadFullOverride(country, era);

    const states = Object.keys(model.census).map((regionId) => {
      const config = editorConfigFromCountryModel(model, regionId, era);
      if (intlOverride) applyOverrideToEditorConfig(config, intlOverride);
      const derived = computeDerivedComposition(config);
      return {
        stateId: regionId,
        config,
        lean: {
          economic: derived.stateEconomicLean,
          social: derived.stateSocialLean,
          display: derived.stateDisplayLean,
        },
      };
    });

    return NextResponse.json({ era, country, states });
  } catch (error) {
    return handleRouteError(error);
  }
}
