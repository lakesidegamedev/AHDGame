import { blendMetricPresets } from "@/lib/seeds/rules/blendMetricPresets";
import { ieMetricPresets1953 } from "./ieMetricPresets1953";
import { ieMetricPresets1991, type MetricPresetBundle } from "./ieMetricPresets";

/** 1979 IE metric overlay: the 1953 and 1991 authored eras blended to 1979. */
export const ieMetricPresets1979: MetricPresetBundle = blendMetricPresets(
  ieMetricPresets1953,
  ieMetricPresets1991,
  1953,
  1991,
  1979
);
