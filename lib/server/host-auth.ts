import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getHostPassword, getHostSessionSecret } from "./env";

export const HOST_COOKIE = "quiz_host";
const HOST_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", getHostSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Compara com HOST_PASSWORD em tempo constante (via HMAC, que iguala os tamanhos). */
export function checkHostPassword(password: string): boolean {
  return safeEqual(sign(`pw:${password}`), sign(`pw:${getHostPassword()}`));
}

/** Valor do cookie: "<expira em>.<assinatura>". */
export function createHostCookieValue(now = Date.now()): string {
  const expiresAt = String(now + HOST_SESSION_TTL_MS);
  return `${expiresAt}.${sign(`host:${expiresAt}`)}`;
}

export function isValidHostCookie(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) < now) return false;
  return safeEqual(signature, sign(`host:${expiresAt}`));
}

export async function setHostCookie() {
  (await cookies()).set(HOST_COOKIE, createHostCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: HOST_SESSION_TTL_MS / 1000,
  });
}

export async function isHostAuthenticated(): Promise<boolean> {
  return isValidHostCookie((await cookies()).get(HOST_COOKIE)?.value);
}

/**
 * Limite simples de tentativas de senha por IP (5 por minuto).
 * Fica na memória da instância: é uma barreira contra chute, não um WAF.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export function consumeLoginAttempt(ip: string, now = Date.now()): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export function resetLoginAttempts(ip: string) {
  attempts.delete(ip);
}
