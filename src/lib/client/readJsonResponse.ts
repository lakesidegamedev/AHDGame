/**
 * Parse a fetch Response as JSON without leaking a raw parser error.
 *
 * `res.json()` throws "Unexpected token ..." when the body is not JSON, for
 * example a compressed body whose Content-Encoding header was lost on the way
 * or an HTML error page from a proxy. Callers show that text to players, which
 * reads as gibberish. This reads the text once and throws a plain error instead.
 */
export class NonJsonResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super("The server sent a reply the page could not read. Please reload and try again.");
    this.name = "NonJsonResponseError";
  }
}

export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NonJsonResponseError(res.status, res.url);
  }
}
