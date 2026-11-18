import { z } from "zod";
import { getGameService } from "@/lib/server/game";
import { hostRoute, jsonOk, parseBody, uuidSchema } from "@/lib/server/http";

export const runtime = "nodejs";

/** `expectedVersion` é a versão que o telão está vendo: dois cliques não pulam fase. */
const bodySchema = z.object({ expectedVersion: z.int().min(1) });

export function POST(request: Request, ctx: RouteContext<"/api/host/sessions/[id]/advance">) {
  return hostRoute(async () => {
    const sessionId = uuidSchema.parse((await ctx.params).id);
    const { expectedVersion } = await parseBody(request, bodySchema);
    return jsonOk(await getGameService().advance(sessionId, expectedVersion));
  });
}
