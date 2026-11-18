import type { SessionStatus } from "./types";

/** Fases em que nenhuma resposta nova entra: o placar está congelado. */
export const FROZEN_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "RESULTS",
  "LEADERBOARD",
  "PODIUM",
  "FINISHED",
]);
