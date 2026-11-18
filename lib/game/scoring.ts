/** Respostas que chegam até este tempo depois do fim ainda contam (com t = T). */
export const ANSWER_GRACE_MS = 500;

export const MAX_POINTS = 1_000;
export const STREAK_STEP = 100;
export const STREAK_CAP = 500;

export type ResponseTiming = { accepted: true; responseMs: number } | { accepted: false };

/**
 * Tempo de resposta medido só no servidor: chegada menos `phase_started_at`.
 * Até `ANSWER_GRACE_MS` depois do fim a resposta é aceita com t = T.
 */
export function resolveResponseTime(
  arrivedAt: number,
  phaseStartedAt: number,
  phaseEndsAt: number,
): ResponseTiming {
  if (arrivedAt > phaseEndsAt + ANSWER_GRACE_MS) return { accepted: false };
  const limit = phaseEndsAt - phaseStartedAt;
  const elapsed = Math.min(Math.max(arrivedAt - phaseStartedAt, 0), limit);
  return { accepted: true, responseMs: elapsed };
}

/**
 * Bônus de sequência: a partir do 2º acerto seguido, +100 por acerto, limitado a +500.
 * `previousStreak` é quantos acertos seguidos o jogador tinha antes desta pergunta.
 */
export function streakBonus(previousStreak: number): number {
  return Math.min(Math.max(previousStreak, 0) * STREAK_STEP, STREAK_CAP);
}

export interface PointsInput {
  isCorrect: boolean;
  responseMs: number;
  timeLimitMs: number;
  multiplier: number;
  /** Bônus já calculado (0 quando a flag STREAK_BONUS está desligada). */
  bonus?: number;
}

/** pontos = round(1000 × m × (1 − t / (2T))); errada ou ausente vale 0. */
export function computePoints({
  isCorrect,
  responseMs,
  timeLimitMs,
  multiplier,
  bonus = 0,
}: PointsInput): number {
  if (!isCorrect) return 0;
  const t = Math.min(Math.max(responseMs, 0), timeLimitMs);
  const base = Math.round(MAX_POINTS * multiplier * (1 - t / (2 * timeLimitMs)));
  return base + bonus;
}

/**
 * Acertos seguidos imediatamente antes de `position`.
 * Pergunta sem resposta quebra a sequência.
 */
export function streakBefore(position: number, correctByPosition: ReadonlyMap<number, boolean>) {
  let streak = 0;
  for (let p = position - 1; p >= 1 && correctByPosition.get(p) === true; p--) streak++;
  return streak;
}

export interface Standing {
  playerId: string;
  nickname: string;
  joinedAt: number;
  score: number;
  correctCount: number;
  /** Soma dos tempos de resposta nas corretas, em ms. */
  correctMs: number;
}

/**
 * Desempate: maior pontuação; mais acertos; menor soma dos tempos nas corretas;
 * quem entrou primeiro. O id fecha a ordem para ela ser sempre determinística.
 */
export function compareStandings(a: Standing, b: Standing): number {
  return (
    b.score - a.score ||
    b.correctCount - a.correctCount ||
    a.correctMs - b.correctMs ||
    a.joinedAt - b.joinedAt ||
    a.playerId.localeCompare(b.playerId)
  );
}

export interface RankedStanding extends Standing {
  rank: number;
}

export function rankStandings(standings: readonly Standing[]): RankedStanding[] {
  return [...standings].sort(compareStandings).map((s, i) => ({ ...s, rank: i + 1 }));
}

export interface AnswerFacts {
  playerId: string;
  isCorrect: boolean;
  responseMs: number;
  points: number;
}

/** Soma as respostas de cada jogador. Usada pelo repositório em memória e nos testes. */
export function computeStandings(
  players: readonly { id: string; nickname: string; joinedAt: number }[],
  answers: readonly AnswerFacts[],
): Standing[] {
  const byPlayer = new Map<string, Standing>(
    players.map((p) => [
      p.id,
      {
        playerId: p.id,
        nickname: p.nickname,
        joinedAt: p.joinedAt,
        score: 0,
        correctCount: 0,
        correctMs: 0,
      },
    ]),
  );
  for (const a of answers) {
    const s = byPlayer.get(a.playerId);
    if (!s) continue;
    s.score += a.points;
    if (a.isCorrect) {
      s.correctCount += 1;
      s.correctMs += a.responseMs;
    }
  }
  return [...byPlayer.values()];
}
