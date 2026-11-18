import { z } from "zod";
import { getGameService } from "@/lib/server/game";
import { handle, jsonOk, parseBody } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  pin: z.string().max(20),
  nickname: z.string().max(100),
});

export function POST(request: Request) {
  return handle(async () => {
    const { pin, nickname } = await parseBody(request, bodySchema);
    return jsonOk(await getGameService().join(pin.replace(/\D/g, ""), nickname), {
      status: 201,
    });
  });
}
