/**
 * Monta o retrato do estado e a visão de cada jogador a partir dos registros.
 * Funções puras: o gabarito só entra no retrato no estado RESULTS.
 */
import type { AnswerRecord, QuestionRecord, QuizRecord, SessionRecord } from "@/lib/db/repository";
import type { RankedStanding } from "./scoring";
import type {
  GameState,
  OptionPosition,
  PlayerView,
  PublicQuestion,
  QuestionResults,
  RankEntry,
  SessionStatus,
} from "./types";

/** Fases em que nenhuma resposta nova entra: o placar está congelado. */
export const FROZEN_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "RESULTS",
  "LEADERBOARD",
  "PODIUM",
  "FINISHED",
]);

const QUESTION_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "QUESTION_INTRO",
  "QUESTION_OPEN",
  "RESULTS",
]);

export function currentQuestion(quiz: QuizRecord, session: SessionRecord) {
  return quiz.questions.find((q) => q.position === session.currentPosition) ?? null;
}

export function toPublicQuestion(question: QuestionRecord): PublicQuestion {
  return {
    id: question.id,
    position: question.position,
    text: question.text,
    mediaUrl: question.mediaUrl,
    timeLimitS: question.timeLimitS,
    pointsMultiplier: question.pointsMultiplier,
    options: question.options.map(({ id, position, text }) => ({ id, position, text })),
  };
}

export function buildResults(
  question: QuestionRecord,
  answerOptionIds: readonly string[],
): QuestionResults {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const positionById = new Map(question.options.map((o) => [o.id, o.position]));
  for (const optionId of answerOptionIds) {
    const position = positionById.get(optionId);
    if (position !== undefined) counts[position] += 1;
  }
  const correct = question.options.find((o) => o.isCorrect);
  if (!correct) throw new Error(`Pergunta ${question.position} sem alternativa correta`);
  return {
    counts,
    correctOptionId: correct.id,
    correctPosition: correct.position,
    totalAnswers: answerOptionIds.length,
  };
}

export function toRankEntries(ranked: readonly RankedStanding[], limit?: number): RankEntry[] {
  return ranked.slice(0, limit).map((s) => ({
    rank: s.rank,
    playerId: s.playerId,
    nickname: s.nickname,
    score: s.score,
    correctCount: s.correctCount,
  }));
}

export interface StateParts {
  session: SessionRecord;
  quiz: QuizRecord;
  playerCount: number;
  now: number;
  /** Obrigatório em RESULTS. */
  results?: QuestionResults;
  /** Obrigatório em LEADERBOARD, PODIUM e FINISHED. */
  ranked?: readonly RankedStanding[];
}

export function buildGameState({
  session,
  quiz,
  playerCount,
  now,
  results,
  ranked,
}: StateParts): GameState {
  const state: GameState = {
    sessionId: session.id,
    version: session.version,
    status: session.status,
    position: session.currentPosition,
    totalQuestions: quiz.questions.length,
    playerCount,
    phaseStartedAt: session.phaseStartedAt,
    phaseEndsAt: session.phaseEndsAt,
    serverNow: now,
  };

  const question = currentQuestion(quiz, session);
  if (question && QUESTION_STATUSES.has(session.status)) {
    state.question = toPublicQuestion(question);
  }
  if (session.status === "RESULTS" && results) state.results = results;
  if (session.status === "LEADERBOARD" && ranked) state.top5 = toRankEntries(ranked, 5);
  if ((session.status === "PODIUM" || session.status === "FINISHED") && ranked) {
    state.podium = toRankEntries(ranked, 3);
  }
  return state;
}

export interface PlayerViewParts {
  player: { id: string; nickname: string };
  status: SessionStatus;
  question: QuestionRecord | null;
  playerAnswers: readonly AnswerRecord[];
  /** Ranking congelado; ausente durante o lobby e a pergunta. */
  ranked?: readonly RankedStanding[];
}

export function buildPlayerView({
  player,
  status,
  question,
  playerAnswers,
  ranked,
}: PlayerViewParts): PlayerView {
  const score = playerAnswers.reduce((sum, a) => sum + a.points, 0);
  const correctCount = playerAnswers.filter((a) => a.isCorrect).length;

  const answer = question ? playerAnswers.find((a) => a.questionId === question.id) : undefined;
  const chosen = answer && question?.options.find((o) => o.id === answer.optionId);
  const currentAnswer =
    question && chosen
      ? { questionId: question.id, optionPosition: chosen.position as OptionPosition }
      : null;

  const showResult = question !== null && FROZEN_STATUSES.has(status) && status !== "FINISHED";
  const lastResult = showResult
    ? {
        questionId: question.id,
        answered: answer !== undefined,
        correct: answer?.isCorrect ?? false,
        points: answer?.points ?? 0,
      }
    : null;

  const index = ranked?.findIndex((s) => s.playerId === player.id) ?? -1;
  const me = index >= 0 ? ranked![index] : undefined;
  const above = index > 0 ? ranked![index - 1] : undefined;

  return {
    playerId: player.id,
    nickname: player.nickname,
    score,
    correctCount,
    rank: me?.rank ?? 0,
    totalPlayers: ranked?.length ?? 0,
    currentAnswer,
    lastResult,
    // Pontos para passar quem está logo à frente (empate em pontos perde no desempate).
    ahead: me && above ? { rank: above.rank, gap: above.score - me.score + 1 } : null,
  };
}
