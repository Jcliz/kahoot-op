import { getGameService } from "@/lib/server/game";
import { hostRoute, jsonOk, uuidSchema } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado completo do telão: retrato, PIN, lobby, contador e ranking final. */
export function GET(_request: Request, ctx: RouteContext<"/api/host/sessions/[id]">) {
  return hostRoute(async () => {
    const sessionId = uuidSchema.parse((await ctx.params).id);
    return jsonOk(await getGameService().getHostState(sessionId));
  });
}
