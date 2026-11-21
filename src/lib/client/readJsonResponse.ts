/**
 * Parse a fetch Response as JSON without leaking a raw parser error.
 *
 * `res.json()` throws "Unexpected token ..." when the body is not JSON, for
 * example a compressed body whose Content-Encoding header was lost on the way
 * or an HTML error page from a proxy. Callers show that text to players, which
 * reads as gibberish. This throws a plain error instead.
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
  try {
    return (await res.json()) as T;
  } catch (err) {
    // Only a body that is not JSON becomes the plain error; an abort or a
    // network fault while reading the body keeps its own type.
    if (err instanceof SyntaxError || (err instanceof Error && err.name === "SyntaxError")) {
      throw new NonJsonResponseError(res.status, res.url);
    }
    throw err;
  }
}
