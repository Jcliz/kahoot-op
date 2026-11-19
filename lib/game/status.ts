import type { GameState, SessionStatus } from "./types";

/** Fases em que nenhuma resposta nova entra: o placar está congelado. */
export const FROZEN_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "RESULTS",
  "LEADERBOARD",
  "PODIUM",
  "FINISHED",
]);

/**
 * Pódio parado há mais que isso conta como jogo encerrado: o apresentador
 * costuma fechar o telão sem avançar para FINISHED.
 */
export const STALE_PODIUM_MS = 15 * 60_000;

/** O jogo acabou para o participante: não há mais nada a acompanhar. */
export function isGameOver(
  state: Pick<GameState, "status" | "phaseStartedAt" | "serverNow">,
): boolean {
  if (state.status === "FINISHED") return true;
  return (
    state.status === "PODIUM" &&
    state.phaseStartedAt !== null &&
    state.serverNow - state.phaseStartedAt > STALE_PODIUM_MS
  );
}
