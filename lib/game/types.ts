/**
 * Tipos compartilhados entre servidor e cliente.
 * Nada aqui pode carregar o gabarito antes do estado RESULTS.
 */

export const SESSION_STATUSES = [
  "LOBBY",
  "QUESTION_INTRO",
  "QUESTION_OPEN",
  "RESULTS",
  "LEADERBOARD",
  "PODIUM",
  "FINISHED",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Posição da alternativa: 0 triângulo, 1 losango, 2 círculo, 3 quadrado. */
export type OptionPosition = 0 | 1 | 2 | 3;

export const OPTION_POSITIONS: readonly OptionPosition[] = [0, 1, 2, 3];

export interface PublicOption {
  id: string;
  position: OptionPosition;
  text: string;
}

/** Pergunta como vai para os navegadores: sem `isCorrect`. */
export interface PublicQuestion {
  id: string;
  position: number;
  text: string;
  mediaUrl: string | null;
  timeLimitS: number;
  pointsMultiplier: number;
  options: PublicOption[];
}

export interface QuestionResults {
  /** Quantas pessoas escolheram cada alternativa, indexado pela posição. */
  counts: [number, number, number, number];
  correctOptionId: string;
  correctPosition: OptionPosition;
  totalAnswers: number;
}

export interface RankEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  correctCount: number;
}

/** Retrato completo do estado da sessão, publicado no canal `session:<id>`. */
export interface GameState {
  sessionId: string;
  version: number;
  status: SessionStatus;
  /** Posição (1..N) da pergunta atual; 0 no lobby. */
  position: number;
  totalQuestions: number;
  playerCount: number;
  /** Epoch em ms, segundo o relógio do servidor. */
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  serverNow: number;
  question?: PublicQuestion;
  results?: QuestionResults;
  top5?: RankEntry[];
  podium?: RankEntry[];
}

export interface PlayerView {
  playerId: string;
  nickname: string;
  score: number;
  correctCount: number;
  rank: number;
  totalPlayers: number;
  /** Resposta enviada para a pergunta atual, se houver. */
  currentAnswer: { questionId: string; optionPosition: OptionPosition } | null;
  /** Resultado da pergunta atual; só existe a partir de RESULTS. */
  lastResult: { questionId: string; correct: boolean; points: number } | null;
  /** Distância para quem está imediatamente à frente; null para o 1º lugar. */
  ahead: { rank: number; gap: number } | null;
}

export interface PlayerStateResponse {
  state: GameState;
  me: PlayerView;
  realtime: RealtimeAccess | null;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
}

export interface AnswerCount {
  answered: number;
  total: number;
}

export interface HostStateResponse {
  state: GameState;
  pin: string;
  players: LobbyPlayer[];
  answerCount: AnswerCount;
  /** Ranking completo; só a partir do pódio. */
  ranking: RankEntry[] | null;
  realtime: RealtimeAccess | null;
}

/** Dados para o navegador assinar os canais privados do Supabase Realtime. */
export interface RealtimeAccess {
  url: string;
  anonKey: string;
  token: string;
}

export interface JoinResponse {
  playerId: string;
  sessionId: string;
  token: string;
}

/** Eventos publicados nos canais de tempo real. */
export const REALTIME_EVENTS = {
  state: "state",
  kicked: "kicked",
  answerCount: "answer_count",
  lobby: "lobby",
} as const;

export const sessionTopic = (sessionId: string) => `session:${sessionId}`;
export const hostTopic = (sessionId: string) => `host:${sessionId}`;
