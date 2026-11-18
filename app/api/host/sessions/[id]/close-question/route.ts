import { z } from "zod";
import { getGameService } from "@/lib/server/game";
import { hostRoute, jsonOk, parseBody, uuidSchema } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * reason "manual": botão Finalizar pergunta (fecha na hora).
 * reason "timeout": cronômetro do telão zerou (o servidor respeita a tolerância de 500 ms).
 */
const bodySchema = z.object({
  expectedVersion: z.int().min(1).optional(),
  reason: z.enum(["manual", "timeout"]).default("manual"),
});

export function POST(
  request: Request,
  ctx: RouteContext<"/api/host/sessions/[id]/close-question">,
) {
  return hostRoute(async () => {
    const sessionId = uuidSchema.parse((await ctx.params).id);
    const { expectedVersion, reason } = await parseBody(request, bodySchema);
    return jsonOk(await getGameService().closeQuestion(sessionId, reason, expectedVersion));
  });
}
