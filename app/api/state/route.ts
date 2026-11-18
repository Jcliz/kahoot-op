import { getGameService } from "@/lib/server/game";
import { bearerToken, handle, jsonError, jsonOk } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Retrato do estado + dados do jogador. Usado na reconexão e no polling de reserva. */
export function GET(request: Request) {
  return handle(async () => {
    const token = bearerToken(request);
    if (!token) return jsonError(401, "PLAYER_NOT_FOUND", "Sua entrada expirou. Entre de novo.");
    return jsonOk(await getGameService().getPlayerState(token));
  });
}
