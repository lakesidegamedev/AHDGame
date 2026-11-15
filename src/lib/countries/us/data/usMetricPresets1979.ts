import { blendMetricPresets } from "@/lib/seeds/rules/blendMetricPresets";
import { usMetricPresets1953 } from "./usMetricPresets1953";
import { usMetricPresets1991, type MetricPresetBundle } from "./usMetricPresets";

/** 1979 US metric overlay: the 1953 and 1991 authored eras blended to 1979. */
export const usMetricPresets1979: MetricPresetBundle = blendMetricPresets(
  usMetricPresets1953,
  usMetricPresets1991,
  1953,
  1991,
  1979
);
