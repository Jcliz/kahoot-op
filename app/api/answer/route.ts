import { z } from "zod";
import { getGameService } from "@/lib/server/game";
import { bearerToken, handle, jsonError, jsonOk, parseBody } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({ questionId: z.uuid(), optionId: z.uuid() });

/** Aceita só em QUESTION_OPEN da pergunta atual; não diz se acertou. */
export function POST(request: Request) {
  return handle(async () => {
    const token = bearerToken(request);
    if (!token) return jsonError(401, "PLAYER_NOT_FOUND", "Sua entrada expirou. Entre de novo.");
    const { questionId, optionId } = await parseBody(request, bodySchema);
    return jsonOk(await getGameService().submitAnswer(token, questionId, optionId));
  });
}
