import type { StoredFingerprintComponents } from "@/lib/utils/fingerprint";

/**
 * Deferred fingerprint capture for the auth entry pages.
 *
 * Building the browser fingerprint is expensive: thumbmark probes canvas,
 * WebGL, audio and the installed font list on the main thread. Running it from
 * a mount effect meant every /login and /register visit paid that work while
 * React was still hydrating the form — page-load telemetry ranks both routes
 * among the slowest in the game even though they have almost no data.
 *
 * Capture therefore starts on first interaction (or a long idle fallback), and any
 * submit or OAuth redirect that arrives earlier awaits the same promise, so the value sent is
 * identical to what the mount effect produced. Failures degrade to an empty
 * hash, exactly as before: the fingerprint is advisory.
 */
export interface CapturedFingerprint {
  hash: string;
  components: StoredFingerprintComponents | null;
}

let capture: Promise<CapturedFingerprint> | null = null;
let scheduled = false;

function beginCapture(): Promise<CapturedFingerprint> {
  if (!capture) {
    // Imported on demand so the fingerprint library stays out of the page's first load.
    capture = import("@/lib/utils/fingerprint")
      .then(({ generateFingerprintData }) => generateFingerprintData())
      .then(({ hash, components }) => ({ hash, components }))
      .catch(() => ({ hash: "", components: null }));
  }
  return capture;
}

const INTERACTION_EVENTS = ["focusin", "pointerdown", "keydown", "touchstart"] as const;
const FALLBACK_DELAY_MS = 10_000;

/**
 * Start capture when the visitor first touches the page, or after a long idle
 * fallback. Probing canvas, WebGL and audio is a multi-second task on a phone, so
 * it must not land while the page is still loading. A sign-in needs the visitor to
 * interact first, and a submit that arrives early awaits the same promise.
 */
export function scheduleFingerprintCapture(): void {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const run = () => {
    for (const name of INTERACTION_EVENTS) window.removeEventListener(name, run);
    window.clearTimeout(timer);
    void beginCapture();
  };
  const timer = window.setTimeout(run, FALLBACK_DELAY_MS);
  for (const name of INTERACTION_EVENTS) {
    window.addEventListener(name, run, { once: true, passive: true });
  }
}

/** Fingerprint for a sign-in submission, starting capture now if it never ran. */
export function getFingerprintForSubmission(): Promise<CapturedFingerprint> {
  return beginCapture();
}
