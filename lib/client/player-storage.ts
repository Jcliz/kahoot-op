/**
 * Credenciais do participante no localStorage do celular. É isso que permite
 * voltar ao jogo (tela bloqueada, aba recarregada, rede caída) sem digitar de novo.
 */

import { isGameOver } from "@/lib/game/status";
import type { PlayerStateResponse } from "@/lib/game/types";
import { ApiRequestError, apiFetch, bearer } from "./api";

const KEY = "quiz.player.v1";

export interface StoredPlayer {
  token: string;
  playerId: string;
  sessionId: string;
  pin: string;
  nickname: string;
}

function isStoredPlayer(value: unknown): value is StoredPlayer {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["token", "playerId", "sessionId", "pin", "nickname"].every(
    (k) => typeof v[k] === "string",
  );
}

export function loadPlayer(): StoredPlayer | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStoredPlayer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePlayer(player: StoredPlayer) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(player));
  } catch {
    // navegação privada sem storage: o jogo segue, só não sobrevive a recarregar
  }
}

export function clearPlayer() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Pergunta ao servidor se a entrada salva ainda vale.
 * - "active": o jogo segue e o participante continua nele.
 * - "over": jogo encerrado, participante removido ou sessão inexistente.
 * - "unknown": sem resposta (rede); quem chama decide.
 */
export async function checkStoredGame(
  player: StoredPlayer,
): Promise<"active" | "over" | "unknown"> {
  try {
    const { state } = await apiFetch<PlayerStateResponse>("/api/state", {
      headers: bearer(player.token),
    });
    return isGameOver(state) ? "over" : "active";
  } catch (error) {
    // 401 entrada expirada, 403 removido, 404 sessão apagada
    if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) return "over";
    return "unknown";
  }
}
