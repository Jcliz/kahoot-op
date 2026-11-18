import { z } from "zod";
import {
  checkHostPassword,
  consumeLoginAttempt,
  resetLoginAttempts,
  setHostCookie,
} from "@/lib/server/host-auth";
import { clientIp, handle, jsonError, jsonOk, parseBody } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

export function POST(request: Request) {
  return handle(async () => {
    const ip = clientIp(request);
    if (!consumeLoginAttempt(ip)) {
      return jsonError(429, "TOO_MANY_ATTEMPTS", "Muitas tentativas. Espere um minuto.");
    }
    const { password } = await parseBody(request, bodySchema);
    if (!checkHostPassword(password)) {
      return jsonError(401, "WRONG_PASSWORD", "Senha incorreta.");
    }
    resetLoginAttempts(ip);
    await setHostCookie();
    return jsonOk({ ok: true });
  });
}
