/**
 * Credenciais do participante no localStorage do celular. É isso que permite
 * voltar ao jogo (tela bloqueada, aba recarregada, rede caída) sem digitar de novo.
 */

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
