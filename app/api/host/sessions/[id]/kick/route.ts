import { z } from "zod";
import { getGameService } from "@/lib/server/game";
import { hostRoute, jsonOk, parseBody, uuidSchema } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({ playerId: z.uuid() });

export function POST(request: Request, ctx: RouteContext<"/api/host/sessions/[id]/kick">) {
  return hostRoute(async () => {
    const sessionId = uuidSchema.parse((await ctx.params).id);
    const { playerId } = await parseBody(request, bodySchema);
    await getGameService().kick(sessionId, playerId);
    return jsonOk({ ok: true });
  });
}
