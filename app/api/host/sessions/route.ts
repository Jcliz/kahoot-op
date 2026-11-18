import { getGameService } from "@/lib/server/game";
import { hostRoute, jsonOk } from "@/lib/server/http";

export const runtime = "nodejs";

export function POST() {
  return hostRoute(async () => jsonOk(await getGameService().createSession(), { status: 201 }));
}
