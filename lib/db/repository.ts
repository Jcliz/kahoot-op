import type { PhaseChange } from "@/lib/game/state-machine";
import type { Standing } from "@/lib/game/scoring";
import type { OptionPosition, SessionStatus } from "@/lib/game/types";

/** Alternativa com o gabarito. Só existe no servidor. */
export interface OptionRecord {
  id: string;
  position: OptionPosition;
  text: string;
  isCorrect: boolean;
}

export interface QuestionRecord {
  id: string;
  position: number;
  text: string;
  mediaUrl: string | null;
  timeLimitS: number;
  pointsMultiplier: number;
  options: OptionRecord[];
}

export interface QuizRecord {
  id: string;
  title: string;
  /** Ordenadas por posição. */
  questions: QuestionRecord[];
}

/** Datas como epoch em ms. */
export interface SessionRecord {
  id: string;
  quizId: string;
  pin: string;
  status: SessionStatus;
  currentPosition: number;
  version: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface PlayerRecord {
  id: string;
  sessionId: string;
  nickname: string;
  nicknameKey: string;
  kicked: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface AnswerRecord {
  playerId: string;
  questionId: string;
  optionId: string;
  isCorrect: boolean;
  responseMs: number;
  points: number;
}

export interface NewPlayer {
  sessionId: string;
  nickname: string;
  nicknameKey: string;
  tokenHash: string;
}

/**
 * Acesso a dados do jogo. Toda regra fica no serviço; o repositório só lê e grava.
 * Implementações: Supabase (produção) e memória (desenvolvimento e testes).
 */
export interface GameRepository {
  getLatestQuiz(): Promise<QuizRecord | null>;
  getQuiz(quizId: string): Promise<QuizRecord | null>;

  /** Devolve null se o PIN já estiver em uso por uma sessão ativa. */
  createSession(input: { quizId: string; pin: string }): Promise<SessionRecord | null>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  findActiveSessionByPin(pin: string): Promise<SessionRecord | null>;
  /**
   * Muda de fase só se a versão gravada ainda for `expectedVersion`
   * (UPDATE ... WHERE version = ...). Devolve null se outro pedido chegou antes.
   */
  updateSessionPhase(
    sessionId: string,
    expectedVersion: number,
    change: PhaseChange,
  ): Promise<SessionRecord | null>;

  /** Devolve "nickname_taken" se já houver o mesmo apelido normalizado na sessão. */
  createPlayer(input: NewPlayer): Promise<PlayerRecord | "nickname_taken">;
  getPlayerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;
  listPlayers(sessionId: string): Promise<PlayerRecord[]>;
  countActivePlayers(sessionId: string): Promise<number>;
  /** Devolve false se o jogador não existir nessa sessão. */
  kickPlayer(sessionId: string, playerId: string): Promise<boolean>;
  touchPlayer(playerId: string, at: number): Promise<void>;

  /** Devolve "duplicate" se o jogador já respondeu essa pergunta. */
  insertAnswer(sessionId: string, answer: AnswerRecord): Promise<"ok" | "duplicate">;
  countAnswers(sessionId: string, questionId: string): Promise<number>;
  /** option_id de cada resposta da pergunta, para montar o gráfico. */
  listAnswerOptions(sessionId: string, questionId: string): Promise<string[]>;
  listPlayerAnswers(sessionId: string, playerId: string): Promise<AnswerRecord[]>;
  listSessionAnswers(sessionId: string): Promise<AnswerRecord[]>;
  /** Placar de cada participante não removido, sem ordenar. */
  getStandings(sessionId: string): Promise<Standing[]>;
}
