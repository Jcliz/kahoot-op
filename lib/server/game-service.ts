import type { GameRepository, PlayerRecord, QuizRecord, SessionRecord } from "@/lib/db/repository";
import { buildResultsCsv } from "@/lib/game/csv";
import { GameError } from "@/lib/game/errors";
import { validateNickname } from "@/lib/game/nickname";
import { isValidPin } from "@/lib/game/pin";
import {
  ANSWER_GRACE_MS,
  computePoints,
  rankStandings,
  resolveResponseTime,
  streakBefore,
  streakBonus,
  type RankedStanding,
} from "@/lib/game/scoring";
import {
  buildGameState,
  buildPlayerView,
  buildResults,
  currentQuestion,
  toRankEntries,
} from "@/lib/game/snapshot";
import { FROZEN_STATUSES } from "@/lib/game/status";
import { transition, type GameAction } from "@/lib/game/state-machine";
import {
  hostTopic,
  REALTIME_EVENTS,
  sessionTopic,
  type AnswerCount,
  type GameState,
  type HostStateResponse,
  type JoinResponse,
  type LobbyPlayer,
  type PlayerStateResponse,
  type QuestionResults,
  type RealtimeAccess,
} from "@/lib/game/types";
import type { Publisher } from "@/lib/realtime/publish";

export type CloseReason = "manual" | "timeout" | "all_answered";

export interface GameServiceDeps {
  repo: GameRepository;
  publisher: Publisher;
  generatePin: () => string;
  generateToken: () => string;
  hashToken: (token: string) => string;
  /** Emite o acesso ao tempo real; devolve null quando não há tempo real (modo memória). */
  realtimeAccess: (input: {
    sessionId: string;
    subject: string;
    isHost: boolean;
  }) => Promise<RealtimeAccess | null>;
  streakBonus?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Dados de uma versão congelada da sessão (o placar não muda mais). */
interface FrozenData {
  ranked: RankedStanding[];
  results?: QuestionResults;
}

const PIN_ATTEMPTS = 10;
const FROZEN_CACHE_LIMIT = 32;
/** Atualiza last_seen_at no máximo a cada 30 s por jogador. */
const TOUCH_INTERVAL_MS = 30_000;
/** Se o telão não fechar a pergunta, o servidor fecha sozinho depois desta folga. */
const AUTO_CLOSE_SLACK_MS = 1_500;
/** Espera máxima para respeitar a tolerância de rede antes de fechar por tempo. */
const MAX_CLOSE_WAIT_MS = 2_000;

/**
 * Regras do jogo no servidor. As rotas só validam a entrada e chamam um método.
 * O estado da sessão só muda aqui, sempre por UPDATE condicional na versão.
 */
export class GameService {
  private readonly repo: GameRepository;
  private readonly publisher: Publisher;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly quizCache = new Map<string, QuizRecord>();
  private readonly frozenCache = new Map<string, Promise<FrozenData>>();

  constructor(private readonly deps: GameServiceDeps) {
    this.repo = deps.repo;
    this.publisher = deps.publisher;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // ---------------------------------------------------------------- apresentador

  async createSession(): Promise<{ sessionId: string; pin: string }> {
    const quiz = await this.repo.getLatestQuiz();
    if (!quiz || quiz.questions.length === 0) throw new GameError("QUIZ_NOT_FOUND");
    this.quizCache.set(quiz.id, quiz);

    for (let attempt = 0; attempt < PIN_ATTEMPTS; attempt++) {
      const session = await this.repo.createSession({
        quizId: quiz.id,
        pin: this.deps.generatePin(),
      });
      if (session) return { sessionId: session.id, pin: session.pin };
    }
    throw new GameError("PIN_EXHAUSTED");
  }

  async getHostState(sessionId: string): Promise<HostStateResponse> {
    const session = await this.autoCloseIfExpired(await this.requireSession(sessionId));
    const quiz = await this.getQuiz(session.quizId);
    const [state, players, realtime] = await Promise.all([
      this.buildState(session, quiz),
      this.activeLobbyPlayers(session.id),
      this.deps.realtimeAccess({ sessionId: session.id, subject: "host", isHost: true }),
    ]);

    const question = currentQuestion(quiz, session);
    const answered =
      question && (session.status === "QUESTION_OPEN" || session.status === "RESULTS")
        ? await this.repo.countAnswers(session.id, question.id)
        : 0;

    const ranking =
      session.status === "PODIUM" || session.status === "FINISHED"
        ? toRankEntries((await this.frozenData(session, quiz)).ranked)
        : null;

    return {
      state,
      pin: session.pin,
      players,
      answerCount: { answered, total: players.length },
      ranking,
      realtime,
    };
  }

  async advance(sessionId: string, expectedVersion: number): Promise<GameState> {
    return this.applyTransition(await this.requireSession(sessionId), "advance", expectedVersion);
  }

  /**
   * Fecha a pergunta. Idempotente: se ela já fechou (pelo tempo, por todos terem
   * respondido ou por outro clique), devolve o estado atual sem erro.
   */
  async closeQuestion(
    sessionId: string,
    reason: CloseReason,
    expectedVersion?: number,
  ): Promise<GameState> {
    let session = await this.requireSession(sessionId);
    const stale = expectedVersion !== undefined && expectedVersion !== session.version;
    if (session.status !== "QUESTION_OPEN" || stale) {
      return this.buildState(session, await this.getQuiz(session.quizId));
    }

    if (reason === "timeout" && session.phaseEndsAt !== null) {
      // Respeita a tolerância de rede: respostas até 500 ms depois do fim ainda contam.
      const wait = session.phaseEndsAt + ANSWER_GRACE_MS - this.now();
      if (wait > 0) {
        await this.sleep(Math.min(wait, MAX_CLOSE_WAIT_MS));
        session = await this.requireSession(sessionId);
        if (session.status !== "QUESTION_OPEN") {
          return this.buildState(session, await this.getQuiz(session.quizId));
        }
      }
    }

    try {
      return await this.applyTransition(session, "close", session.version);
    } catch (error) {
      if (error instanceof GameError && error.code === "STALE_VERSION") {
        const latest = await this.requireSession(sessionId);
        return this.buildState(latest, await this.getQuiz(latest.quizId));
      }
      throw error;
    }
  }

  async kick(sessionId: string, playerId: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    const kicked = await this.repo.kickPlayer(session.id, playerId);
    if (!kicked) throw new GameError("PLAYER_NOT_FOUND");

    await Promise.all([
      this.safePublish(sessionTopic(session.id), REALTIME_EVENTS.kicked, { playerId }),
      this.publishLobby(session.id),
    ]);

    if (session.status === "QUESTION_OPEN") await this.closeIfEveryoneAnswered(session);
  }

  async exportCsv(sessionId: string): Promise<string> {
    const session = await this.requireSession(sessionId);
    if (session.status !== "FINISHED") throw new GameError("INVALID_TRANSITION");
    const quiz = await this.getQuiz(session.quizId);
    const [{ ranked }, answers] = await Promise.all([
      this.frozenData(session, quiz),
      this.repo.listSessionAnswers(session.id),
    ]);
    const positionById = new Map(quiz.questions.map((q) => [q.id, q.position]));
    return buildResultsCsv(
      toRankEntries(ranked),
      answers.map((a) => ({
        playerId: a.playerId,
        questionPosition: positionById.get(a.questionId) ?? 0,
        isCorrect: a.isCorrect,
      })),
      quiz.questions.length,
    );
  }

  // ----------------------------------------------------------------- participante

  async join(pin: string, rawNickname: string): Promise<JoinResponse> {
    if (!isValidPin(pin)) throw new GameError("SESSION_NOT_FOUND");
    const session = await this.repo.findActiveSessionByPin(pin);
    if (!session) throw new GameError("SESSION_NOT_FOUND");
    if (session.status !== "LOBBY") throw new GameError("GAME_ALREADY_STARTED");

    const check = validateNickname(rawNickname);
    if (!check.ok) {
      throw new GameError(check.reason === "length" ? "NICKNAME_INVALID" : "NICKNAME_BLOCKED");
    }

    const token = this.deps.generateToken();
    const player = await this.repo.createPlayer({
      sessionId: session.id,
      nickname: check.nickname,
      nicknameKey: check.key,
      tokenHash: this.deps.hashToken(token),
    });
    if (player === "nickname_taken") throw new GameError("NICKNAME_TAKEN");

    await this.publishLobby(session.id);
    return { playerId: player.id, sessionId: session.id, token };
  }

  async getPlayerState(token: string): Promise<PlayerStateResponse> {
    const player = await this.requirePlayer(token);
    const session = await this.autoCloseIfExpired(await this.requireSession(player.sessionId));
    const quiz = await this.getQuiz(session.quizId);

    const frozen = FROZEN_STATUSES.has(session.status)
      ? await this.frozenData(session, quiz)
      : undefined;
    const [state, playerAnswers, realtime] = await Promise.all([
      this.buildState(session, quiz, frozen),
      this.repo.listPlayerAnswers(session.id, player.id),
      this.deps.realtimeAccess({ sessionId: session.id, subject: player.id, isHost: false }),
      this.touch(player),
    ]);

    const me = buildPlayerView({
      player,
      status: session.status,
      question: currentQuestion(quiz, session),
      playerAnswers,
      ranked: frozen?.ranked,
    });
    return { state, me, realtime };
  }

  async submitAnswer(token: string, questionId: string, optionId: string) {
    const arrivedAt = this.now();
    const player = await this.requirePlayer(token);
    const session = await this.requireSession(player.sessionId);
    if (session.status !== "QUESTION_OPEN") throw new GameError("QUESTION_NOT_OPEN");

    const quiz = await this.getQuiz(session.quizId);
    const question = currentQuestion(quiz, session);
    if (!question || question.id !== questionId) throw new GameError("QUESTION_NOT_OPEN");
    const option = question.options.find((o) => o.id === optionId);
    if (!option) throw new GameError("OPTION_NOT_FOUND");

    const timing = resolveResponseTime(arrivedAt, session.phaseStartedAt!, session.phaseEndsAt!);
    if (!timing.accepted) throw new GameError("ANSWER_TOO_LATE");

    let bonus = 0;
    if (this.deps.streakBonus && option.isCorrect) {
      const previous = await this.repo.listPlayerAnswers(session.id, player.id);
      const positionById = new Map(quiz.questions.map((q) => [q.id, q.position]));
      const correctByPosition = new Map(
        previous.map((a) => [positionById.get(a.questionId) ?? 0, a.isCorrect]),
      );
      bonus = streakBonus(streakBefore(question.position, correctByPosition));
    }

    const result = await this.repo.insertAnswer(session.id, {
      playerId: player.id,
      questionId: question.id,
      optionId: option.id,
      isCorrect: option.isCorrect,
      responseMs: timing.responseMs,
      points: computePoints({
        isCorrect: option.isCorrect,
        responseMs: timing.responseMs,
        timeLimitMs: question.timeLimitS * 1000,
        multiplier: question.pointsMultiplier,
        bonus,
      }),
    });
    if (result === "duplicate") throw new GameError("ALREADY_ANSWERED");

    await this.closeIfEveryoneAnswered(session);
    // Não diz se acertou: o resultado só sai em RESULTS.
    return { received: true as const };
  }

  // ---------------------------------------------------------------------- interno

  private async applyTransition(
    session: SessionRecord,
    action: GameAction,
    expectedVersion: number,
  ): Promise<GameState> {
    const quiz = await this.getQuiz(session.quizId);
    const result = transition(session, action, {
      totalQuestions: quiz.questions.length,
      now: this.now(),
      timeLimitMsAt: (position) =>
        (quiz.questions.find((q) => q.position === position)?.timeLimitS ?? 20) * 1000,
    });
    if (!result.ok) throw new GameError("INVALID_TRANSITION");
    if (session.version !== expectedVersion) throw new GameError("STALE_VERSION");

    const updated = await this.repo.updateSessionPhase(session.id, expectedVersion, result.next);
    if (!updated) throw new GameError("STALE_VERSION");

    const state = await this.buildState(updated, quiz);
    await this.safePublish(sessionTopic(updated.id), REALTIME_EVENTS.state, state);
    return state;
  }

  private async closeIfEveryoneAnswered(session: SessionRecord) {
    const question = (await this.getQuiz(session.quizId)).questions.find(
      (q) => q.position === session.currentPosition,
    );
    if (!question) return;
    const [answered, total] = await Promise.all([
      this.repo.countAnswers(session.id, question.id),
      this.repo.countActivePlayers(session.id),
    ]);
    const count: AnswerCount = { answered, total };
    await this.safePublish(hostTopic(session.id), REALTIME_EVENTS.answerCount, count);
    if (total > 0 && answered >= total) {
      await this.closeQuestion(session.id, "all_answered", session.version);
    }
  }

  /** Se o telão sumiu e a pergunta passou do tempo, fecha no primeiro pedido que chegar. */
  private async autoCloseIfExpired(session: SessionRecord): Promise<SessionRecord> {
    if (
      session.status === "QUESTION_OPEN" &&
      session.phaseEndsAt !== null &&
      this.now() > session.phaseEndsAt + ANSWER_GRACE_MS + AUTO_CLOSE_SLACK_MS
    ) {
      await this.closeQuestion(session.id, "timeout", session.version);
      return this.requireSession(session.id);
    }
    return session;
  }

  private async buildState(
    session: SessionRecord,
    quiz: QuizRecord,
    frozen?: FrozenData,
  ): Promise<GameState> {
    const data: FrozenData | undefined =
      frozen ??
      (FROZEN_STATUSES.has(session.status) ? await this.frozenData(session, quiz) : undefined);
    const playerCount = await this.repo.countActivePlayers(session.id);
    return buildGameState({
      session,
      quiz,
      playerCount,
      now: this.now(),
      results: data?.results,
      ranked: data?.ranked,
    });
  }

  /**
   * Ranking e gráfico de uma versão congelada da sessão. Calculado uma vez por
   * versão e reaproveitado pelos ~110 celulares que pedem o estado ao mesmo tempo.
   */
  private frozenData(session: SessionRecord, quiz: QuizRecord): Promise<FrozenData> {
    const key = `${session.id}:${session.version}`;
    let cached = this.frozenCache.get(key);
    if (!cached) {
      cached = (async () => {
        const question = currentQuestion(quiz, session);
        const [standings, optionIds] = await Promise.all([
          this.repo.getStandings(session.id),
          session.status === "RESULTS" && question
            ? this.repo.listAnswerOptions(session.id, question.id)
            : Promise.resolve(null),
        ]);
        return {
          ranked: rankStandings(standings),
          results: question && optionIds ? buildResults(question, optionIds) : undefined,
        };
      })();
      cached.catch(() => this.frozenCache.delete(key));
      this.frozenCache.set(key, cached);
      if (this.frozenCache.size > FROZEN_CACHE_LIMIT) {
        this.frozenCache.delete(this.frozenCache.keys().next().value!);
      }
    }
    return cached;
  }

  private async getQuiz(quizId: string): Promise<QuizRecord> {
    const cached = this.quizCache.get(quizId);
    if (cached) return cached;
    const quiz = await this.repo.getQuiz(quizId);
    if (!quiz) throw new GameError("QUIZ_NOT_FOUND");
    this.quizCache.set(quizId, quiz);
    return quiz;
  }

  private async requireSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.repo.getSession(sessionId);
    if (!session) throw new GameError("SESSION_NOT_FOUND");
    return session;
  }

  private async requirePlayer(token: string): Promise<PlayerRecord> {
    const player = await this.repo.getPlayerByTokenHash(this.deps.hashToken(token));
    if (!player) throw new GameError("PLAYER_NOT_FOUND");
    if (player.kicked) throw new GameError("PLAYER_KICKED");
    return player;
  }

  private async touch(player: PlayerRecord) {
    const now = this.now();
    if (now - player.lastSeenAt > TOUCH_INTERVAL_MS) await this.repo.touchPlayer(player.id, now);
  }

  private async activeLobbyPlayers(sessionId: string): Promise<LobbyPlayer[]> {
    const players = await this.repo.listPlayers(sessionId);
    return players.filter((p) => !p.kicked).map((p) => ({ id: p.id, nickname: p.nickname }));
  }

  private async publishLobby(sessionId: string) {
    const players = await this.activeLobbyPlayers(sessionId);
    await this.safePublish(hostTopic(sessionId), REALTIME_EVENTS.lobby, { players });
  }

  /**
   * Falha no tempo real não pode derrubar o comando: o estado já está gravado
   * e os navegadores se recuperam pelo polling de reserva.
   */
  private async safePublish(topic: string, event: string, payload: unknown) {
    try {
      await this.publisher.publish(topic, event, payload);
    } catch (error) {
      console.error(`[realtime] falha ao publicar ${event} em ${topic}:`, error);
    }
  }
}
