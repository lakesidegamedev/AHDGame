import type { Layer1Config } from "@/lib/seeds/stateDemographics";
import type { DemographicPosition } from "@/lib/seeds/demographicCategories";
import type { EraId } from "@/lib/seeds/presetSelector";
import type { BucketProfileSection } from "@/lib/demographics/bucketProfile";

/** Per Layer-1 key: share %, baseline turnout %, and econ/social position. */
export interface EditorLayer1Entry extends DemographicPosition {
  share: number; // 0-100, sums to 100 within a dimension
  turnout: number; // 0-100
  /** Values the preset opened with; the preview shifts the census by an edit's distance from these. */
  base?: { share: number; economicLean: number; socialLean: number; turnout: number };
}
export type EditorDimension = Record<string, EditorLayer1Entry>;
export type EditorLayer1Config = Record<string, EditorDimension>;

export interface EditorStateConfig {
  era: EraId;
  countryId: string;
  stateId: string;
  dims: string[];
  layer1: EditorLayer1Config;
}

export interface DerivedComposition {
  /** Census buckets per dimension, with the editor's edits applied. */
  buckets: BucketProfileSection[];
  stateEconomicLean: number;
  stateSocialLean: number;
  stateDisplayLean: number;
}

export type { Layer1Config, EraId };
