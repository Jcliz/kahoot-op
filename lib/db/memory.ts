import { randomUUID } from "node:crypto";
import { computeStandings, type Standing } from "@/lib/game/scoring";
import type { PhaseChange } from "@/lib/game/state-machine";
import type { QuizFile } from "@/lib/game/quiz-schema";
import type { OptionPosition } from "@/lib/game/types";
import type {
  AnswerRecord,
  GameRepository,
  NewPlayer,
  PlayerRecord,
  QuizRecord,
  SessionRecord,
} from "./repository";

interface StoredAnswer extends AnswerRecord {
  sessionId: string;
}

/** Converte o formato do quiz.json no formato do repositório, com ids gerados. */
export function quizRecordFromFile(quiz: QuizFile, id: string = randomUUID()): QuizRecord {
  return {
    id,
    title: quiz.title,
    questions: [...quiz.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: randomUUID(),
        position: q.position,
        text: q.text,
        mediaUrl: q.media,
        timeLimitS: q.timeLimitSeconds,
        pointsMultiplier: q.pointsMultiplier,
        options: q.options.map((o, index) => ({
          id: randomUUID(),
          position: index as OptionPosition,
          text: o.text,
          isCorrect: o.correct,
        })),
      })),
  };
}

/**
 * Repositório em memória. Serve para desenvolvimento sem Supabase e para os testes.
 * Só funciona com um único processo: nunca usar em produção na Vercel.
 */
export class MemoryRepository implements GameRepository {
  private readonly quizzes: QuizRecord[] = [];
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly players = new Map<string, PlayerRecord & { tokenHash: string }>();
  private readonly answers: StoredAnswer[] = [];

  constructor(quizzes: QuizRecord[] = []) {
    this.quizzes.push(...quizzes);
  }

  /** Nova versão do conteúdo; sessões já criadas continuam com o quiz que jogaram. */
  addQuiz(quiz: QuizRecord) {
    this.quizzes.push(quiz);
  }

  async getLatestQuiz() {
    return this.quizzes.at(-1) ?? null;
  }

  async getQuiz(quizId: string) {
    return this.quizzes.find((q) => q.id === quizId) ?? null;
  }

  async createSession({ quizId, pin }: { quizId: string; pin: string }) {
    if (await this.findActiveSessionByPin(pin)) return null;
    const session: SessionRecord = {
      id: randomUUID(),
      quizId,
      pin,
      status: "LOBBY",
      currentPosition: 0,
      version: 1,
      phaseStartedAt: null,
      phaseEndsAt: null,
      createdAt: Date.now(),
      finishedAt: null,
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async getSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    return s ? { ...s } : null;
  }

  async findActiveSessionByPin(pin: string) {
    const s = [...this.sessions.values()].find((x) => x.pin === pin && x.status !== "FINISHED");
    return s ? { ...s } : null;
  }

  async updateSessionPhase(sessionId: string, expectedVersion: number, change: PhaseChange) {
    const s = this.sessions.get(sessionId);
    if (!s || s.version !== expectedVersion) return null;
    const updated: SessionRecord = {
      ...s,
      status: change.status,
      currentPosition: change.currentPosition,
      phaseStartedAt: change.phaseStartedAt,
      phaseEndsAt: change.phaseEndsAt,
      finishedAt: change.finished ? change.phaseStartedAt : s.finishedAt,
      version: s.version + 1,
    };
    this.sessions.set(sessionId, updated);
    return { ...updated };
  }

  async createPlayer(input: NewPlayer) {
    const taken = [...this.players.values()].some(
      (p) => p.sessionId === input.sessionId && p.nicknameKey === input.nicknameKey,
    );
    if (taken) return "nickname_taken" as const;
    const now = Date.now();
    const player = {
      id: randomUUID(),
      sessionId: input.sessionId,
      nickname: input.nickname,
      nicknameKey: input.nicknameKey,
      tokenHash: input.tokenHash,
      kicked: false,
      joinedAt: now,
      lastSeenAt: now,
    };
    this.players.set(player.id, player);
    return toPlayer(player);
  }

  async getPlayerByTokenHash(tokenHash: string) {
    const p = [...this.players.values()].find((x) => x.tokenHash === tokenHash);
    return p ? toPlayer(p) : null;
  }

  async listPlayers(sessionId: string) {
    return [...this.players.values()]
      .filter((p) => p.sessionId === sessionId)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(toPlayer);
  }

  async countActivePlayers(sessionId: string) {
    return [...this.players.values()].filter((p) => p.sessionId === sessionId && !p.kicked).length;
  }

  async kickPlayer(sessionId: string, playerId: string) {
    const p = this.players.get(playerId);
    if (!p || p.sessionId !== sessionId) return false;
    p.kicked = true;
    return true;
  }

  async touchPlayer(playerId: string, at: number) {
    const p = this.players.get(playerId);
    if (p) p.lastSeenAt = at;
  }

  async insertAnswer(sessionId: string, answer: AnswerRecord) {
    const duplicate = this.answers.some(
      (a) => a.playerId === answer.playerId && a.questionId === answer.questionId,
    );
    if (duplicate) return "duplicate" as const;
    this.answers.push({ ...answer, sessionId });
    return "ok" as const;
  }

  async countAnswers(sessionId: string, questionId: string) {
    return this.answers.filter((a) => a.sessionId === sessionId && a.questionId === questionId)
      .length;
  }

  async listAnswerOptions(sessionId: string, questionId: string) {
    return this.answers
      .filter((a) => a.sessionId === sessionId && a.questionId === questionId)
      .map((a) => a.optionId);
  }

  async listPlayerAnswers(sessionId: string, playerId: string) {
    return this.answers
      .filter((a) => a.sessionId === sessionId && a.playerId === playerId)
      .map(stripSession);
  }

  async listSessionAnswers(sessionId: string) {
    return this.answers.filter((a) => a.sessionId === sessionId).map(stripSession);
  }

  async getStandings(sessionId: string): Promise<Standing[]> {
    const players = [...this.players.values()].filter(
      (p) => p.sessionId === sessionId && !p.kicked,
    );
    return computeStandings(
      players,
      this.answers.filter((a) => a.sessionId === sessionId),
    );
  }
}

function toPlayer(p: PlayerRecord & { tokenHash: string }): PlayerRecord {
  return {
    id: p.id,
    sessionId: p.sessionId,
    nickname: p.nickname,
    nicknameKey: p.nicknameKey,
    kicked: p.kicked,
    joinedAt: p.joinedAt,
    lastSeenAt: p.lastSeenAt,
  };
}

function stripSession(stored: StoredAnswer): AnswerRecord {
  return {
    playerId: stored.playerId,
    questionId: stored.questionId,
    optionId: stored.optionId,
    isCorrect: stored.isCorrect,
    responseMs: stored.responseMs,
    points: stored.points,
  };
}
