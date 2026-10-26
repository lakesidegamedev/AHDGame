/** Sentry tag keys for SLO signals, so tagging code and dashboards agree. */
export const SLO_TAG = {
  API_AVAILABILITY: "slo.api_availability",
  TURN_SUCCESS: "slo.turn_success",
} as const;
