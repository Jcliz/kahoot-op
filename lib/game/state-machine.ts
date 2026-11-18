import type { SessionStatus } from "./types";

/** Tempo de leitura: só o enunciado aparece; os 20 s de resposta começam depois. */
export const QUESTION_INTRO_MS = 5_000;

export type GameAction = "advance" | "close";

export interface PhaseSnapshot {
  status: SessionStatus;
  currentPosition: number;
}

export interface TransitionContext {
  totalQuestions: number;
  now: number;
  /** Tempo limite (ms) da pergunta na posição informada. */
  timeLimitMsAt: (position: number) => number;
}

export interface PhaseChange {
  status: SessionStatus;
  currentPosition: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  finished: boolean;
}

export type TransitionResult = { ok: true; next: PhaseChange } | { ok: false };

/**
 * Transições permitidas (seção "Fluxo do jogo" do plano). Função pura:
 * quem chama é responsável por gravar o resultado de forma condicional.
 */
export function transition(
  current: PhaseSnapshot,
  action: GameAction,
  ctx: TransitionContext,
): TransitionResult {
  const { now, totalQuestions } = ctx;
  const phase = (
    status: SessionStatus,
    position: number,
    endsAt: number | null = null,
  ): TransitionResult => ({
    ok: true,
    next: {
      status,
      currentPosition: position,
      phaseStartedAt: now,
      phaseEndsAt: endsAt,
      finished: status === "FINISHED",
    },
  });

  if (action === "close") {
    return current.status === "QUESTION_OPEN"
      ? phase("RESULTS", current.currentPosition)
      : { ok: false };
  }

  switch (current.status) {
    case "LOBBY":
      return totalQuestions > 0
        ? phase("QUESTION_INTRO", 1, now + QUESTION_INTRO_MS)
        : { ok: false };
    case "QUESTION_INTRO":
      return phase(
        "QUESTION_OPEN",
        current.currentPosition,
        now + ctx.timeLimitMsAt(current.currentPosition),
      );
    case "RESULTS":
      return current.currentPosition >= totalQuestions
        ? phase("PODIUM", current.currentPosition)
        : phase("LEADERBOARD", current.currentPosition);
    case "LEADERBOARD": {
      const nextPosition = current.currentPosition + 1;
      return nextPosition <= totalQuestions
        ? phase("QUESTION_INTRO", nextPosition, now + QUESTION_INTRO_MS)
        : { ok: false };
    }
    case "PODIUM":
      return phase("FINISHED", current.currentPosition);
    case "QUESTION_OPEN":
    case "FINISHED":
      return { ok: false };
  }
}

/** Estados em que a sessão ainda pode ser encontrada pelo PIN. */
export const isSessionActive = (status: SessionStatus) => status !== "FINISHED";
