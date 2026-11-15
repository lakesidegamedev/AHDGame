import { blendMetricPresets } from "@/lib/seeds/rules/blendMetricPresets";
import { ngMetricPresets1953 } from "./ngMetricPresets1953";
import { ngMetricPresets1991, type MetricPresetBundle } from "./ngMetricPresets";

/** 1979 NG metric overlay: the 1953 and 1991 authored eras blended to 1979. */
export const ngMetricPresets1979: MetricPresetBundle = blendMetricPresets(
  ngMetricPresets1953,
  ngMetricPresets1991,
  1953,
  1991,
  1979
);
