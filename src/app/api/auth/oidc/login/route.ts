import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { authConfig } from "@/lib/config/auth";
import { unifiedOidcFlowsCollection } from "@/lib/db/repositories/unifiedOidcFlows";

export async function GET() {
  if (!authConfig.unifiedOidcEnabled()) return new NextResponse(null, { status: 404 });
  const issuer = authConfig.unifiedOidcIssuer();
  const clientId = authConfig.unifiedOidcClientId();
  const redirectUri = authConfig.unifiedOidcRedirectUri();
  if (!issuer || !clientId || !redirectUri) return new NextResponse(null, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const db = await getDb();
  const flows = unifiedOidcFlowsCollection<{
    _id: string;
    state: string;
    nonce: string;
    verifier: string;
    expiresAt: Date;
  }>(db);
  await flows.insertOne({ _id: randomUUID(), state, nonce, verifier, expiresAt });
  await flows.createIndex({ state: 1 }, { unique: true });
  await flows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(url);
}
