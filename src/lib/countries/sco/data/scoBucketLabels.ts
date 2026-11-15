/**
 * SCO uses the United Kingdom's bucket labels: same terms, same electorate.
 *
 * Re-export, not a copy. Keeps one object so the two stay identical by
 * reference rather than by anyone remembering to edit both.
 */
export { UK_BUCKET_LABELS as SCO_BUCKET_LABELS } from "@/lib/countries/uk/data/ukBucketLabels";
