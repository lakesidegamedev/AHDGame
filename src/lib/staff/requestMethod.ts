import { headers } from "next/headers";
import { REQUEST_METHOD_HEADER } from "./rules";

/**
 * The HTTP method of the current API request, as stamped by the proxy.
 *
 * Route guards take no request argument, so the proxy copies the real method
 * into a request header it always overwrites. Returns null when the header is
 * absent, which the read-only role treats as a write and denies.
 */
export async function currentRequestMethod(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get(REQUEST_METHOD_HEADER);
  } catch {
    return null;
  }
}
