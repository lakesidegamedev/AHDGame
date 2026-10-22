import { generateFingerprintData, type StoredFingerprintComponents } from "@/lib/utils/fingerprint";

/**
 * Deferred fingerprint capture for the auth entry pages.
 *
 * Building the browser fingerprint is expensive: thumbmark probes canvas,
 * WebGL, audio and the installed font list on the main thread. Running it from
 * a mount effect meant every /login and /register visit paid that work while
 * React was still hydrating the form — page-load telemetry ranks both routes
 * among the slowest in the game even though they have almost no data.
 *
 * Capture therefore starts at idle after first paint, and any submit or OAuth
 * redirect that arrives earlier awaits the same promise, so the value sent is
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
    capture = generateFingerprintData()
      .then(({ hash, components }) => ({ hash, components }))
      .catch(() => ({ hash: "", components: null }));
  }
  return capture;
}

/** Start capture once the browser is idle, so it cannot compete with hydration. */
export function scheduleFingerprintCapture(): void {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  const run = () => {
    void beginCapture();
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  window.setTimeout(run, 1200);
}

/** Fingerprint for a sign-in submission, starting capture now if it never ran. */
export function getFingerprintForSubmission(): Promise<CapturedFingerprint> {
  return beginCapture();
}
