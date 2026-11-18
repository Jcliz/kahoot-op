import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { SignJWT } from "jose";

/** Token do participante: guardado no localStorage do celular; no banco fica só o hash. */
export function generatePlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** PIN numérico de 6 dígitos que nunca começa com zero. */
export function generatePin(): string {
  return String(randomInt(100_000, 1_000_000));
}

const REALTIME_TOKEN_TTL_S = 12 * 60 * 60;

/**
 * JWT para o navegador assinar os canais privados do Realtime.
 * A política em realtime.messages só deixa ESCUTAR `session:<session_id>`
 * e, para o telão, `host:<host_session_id>`.
 */
export async function signRealtimeToken(
  jwtSecret: string,
  claims: { subject: string; sessionId: string; isHost: boolean },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: "authenticated",
    session_id: claims.sessionId,
    ...(claims.isHost ? { host_session_id: claims.sessionId } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.subject)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + REALTIME_TOKEN_TTL_S)
    .sign(new TextEncoder().encode(jwtSecret));
}
