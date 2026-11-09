/** Temporary ops pause. Existing worlds freeze until an admin explicitly resumes. */
export function governmentConfidenceEnabled(
  config?: { governmentConfidenceEnabled?: boolean } | null
): boolean {
  return config?.governmentConfidenceEnabled === true;
}
