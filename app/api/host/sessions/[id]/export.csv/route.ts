import { getGameService } from "@/lib/server/game";
import { hostRoute, uuidSchema } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, ctx: RouteContext<"/api/host/sessions/[id]/export.csv">) {
  return hostRoute(async () => {
    const sessionId = uuidSchema.parse((await ctx.params).id);
    const csv = await getGameService().exportCsv(sessionId);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quiz-resultados-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
