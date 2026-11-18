import "server-only";
import { z } from "zod";
import { GameError } from "@/lib/game/errors";
import { isHostAuthenticated } from "./host-auth";

export interface ApiErrorBody {
  error: string;
  message: string;
}

export function jsonError(status: number, error: string, message: string) {
  return Response.json({ error, message } satisfies ApiErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function jsonOk(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

/** Converte exceções em respostas JSON padronizadas. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GameError) return jsonError(error.status, error.code, error.message);
    if (error instanceof z.ZodError) {
      return jsonError(400, "INVALID_INPUT", "Dados inválidos.");
    }
    console.error("[api] erro inesperado:", error);
    return jsonError(500, "INTERNAL", "Algo deu errado. Tente de novo.");
  }
}

export async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new z.ZodError([]);
  }
  return schema.parse(raw) as z.infer<T>;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(header);
  return match ? match[1] : null;
}

/** Envolve rotas do apresentador: exige o cookie assinado. */
export function hostRoute(fn: () => Promise<Response>): Promise<Response> {
  return handle(async () => {
    if (!(await isHostAuthenticated())) {
      return jsonError(401, "HOST_UNAUTHORIZED", "Entre com a senha do apresentador.");
    }
    return fn();
  });
}

export const uuidSchema = z.uuid();

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
