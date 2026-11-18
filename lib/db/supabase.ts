import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { Standing } from "@/lib/game/scoring";
import type { PhaseChange } from "@/lib/game/state-machine";
import type { OptionPosition, SessionStatus } from "@/lib/game/types";
import type {
  AnswerRecord,
  GameRepository,
  NewPlayer,
  PlayerRecord,
  QuizRecord,
  SessionRecord,
} from "./repository";

/** Linhas como vêm do PostgREST (datas em ISO). */
interface SessionRow {
  id: string;
  quiz_id: string;
  pin: string;
  status: SessionStatus;
  current_position: number;
  version: number;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  created_at: string;
  finished_at: string | null;
}

interface PlayerRow {
  id: string;
  session_id: string;
  nickname: string;
  nickname_key: string;
  kicked: boolean;
  joined_at: string;
  last_seen_at: string;
}

interface AnswerRow {
  player_id: string;
  question_id: string;
  option_id: string;
  is_correct: boolean;
  response_ms: number;
  points: number;
}

interface StandingRow {
  player_id: string;
  nickname: string;
  joined_at: string;
  score: number;
  correct_count: number;
  correct_ms: number;
}

interface QuizRow {
  id: string;
  title: string;
  question: {
    id: string;
    position: number;
    text: string;
    media_url: string | null;
    time_limit_s: number;
    points_multiplier: number;
    option: { id: string; position: number; text: string; is_correct: boolean }[];
  }[];
}

const SESSION_COLUMNS =
  "id, quiz_id, pin, status, current_position, version, phase_started_at, phase_ends_at, created_at, finished_at";
const PLAYER_COLUMNS = "id, session_id, nickname, nickname_key, kicked, joined_at, last_seen_at";
const ANSWER_COLUMNS = "player_id, question_id, option_id, is_correct, response_ms, points";
const QUIZ_COLUMNS =
  "id, title, question(id, position, text, media_url, time_limit_s, points_multiplier, option(id, position, text, is_correct))";

const UNIQUE_VIOLATION = "23505";
const PAGE_SIZE = 1000;

const ms = (iso: string) => Date.parse(iso);
const msOrNull = (iso: string | null) => (iso === null ? null : Date.parse(iso));
const isoOrNull = (epoch: number | null) => (epoch === null ? null : new Date(epoch).toISOString());

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    quizId: row.quiz_id,
    pin: row.pin,
    status: row.status,
    currentPosition: row.current_position,
    version: row.version,
    phaseStartedAt: msOrNull(row.phase_started_at),
    phaseEndsAt: msOrNull(row.phase_ends_at),
    createdAt: ms(row.created_at),
    finishedAt: msOrNull(row.finished_at),
  };
}

function toPlayer(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    nickname: row.nickname,
    nicknameKey: row.nickname_key,
    kicked: row.kicked,
    joinedAt: ms(row.joined_at),
    lastSeenAt: ms(row.last_seen_at),
  };
}

function toAnswer(row: AnswerRow): AnswerRecord {
  return {
    playerId: row.player_id,
    questionId: row.question_id,
    optionId: row.option_id,
    isCorrect: row.is_correct,
    responseMs: row.response_ms,
    points: row.points,
  };
}

function toQuiz(row: QuizRow): QuizRecord {
  return {
    id: row.id,
    title: row.title,
    questions: [...row.question]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: q.id,
        position: q.position,
        text: q.text,
        mediaUrl: q.media_url,
        timeLimitS: q.time_limit_s,
        pointsMultiplier: q.points_multiplier,
        options: [...q.option]
          .sort((a, b) => a.position - b.position)
          .map((o) => ({
            id: o.id,
            position: o.position as OptionPosition,
            text: o.text,
            isCorrect: o.is_correct,
          })),
      })),
  };
}

function fail(operation: string, error: PostgrestError): never {
  throw new Error(`Supabase: falha em ${operation}: ${error.message} (${error.code})`);
}

/** Repositório de produção: Postgres do Supabase com a chave service_role. */
export class SupabaseRepository implements GameRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async getLatestQuiz() {
    const { data, error } = await this.db
      .from("quiz")
      .select(QUIZ_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<QuizRow>();
    if (error) fail("getLatestQuiz", error);
    return data ? toQuiz(data) : null;
  }

  async getQuiz(quizId: string) {
    const { data, error } = await this.db
      .from("quiz")
      .select(QUIZ_COLUMNS)
      .eq("id", quizId)
      .maybeSingle<QuizRow>();
    if (error) fail("getQuiz", error);
    return data ? toQuiz(data) : null;
  }

  async createSession({ quizId, pin }: { quizId: string; pin: string }) {
    const { data, error } = await this.db
      .from("session")
      .insert({ quiz_id: quizId, pin })
      .select(SESSION_COLUMNS)
      .single<SessionRow>();
    if (error?.code === UNIQUE_VIOLATION) return null;
    if (error) fail("createSession", error);
    return toSession(data);
  }

  async getSession(sessionId: string) {
    const { data, error } = await this.db
      .from("session")
      .select(SESSION_COLUMNS)
      .eq("id", sessionId)
      .maybeSingle<SessionRow>();
    if (error) fail("getSession", error);
    return data ? toSession(data) : null;
  }

  async findActiveSessionByPin(pin: string) {
    const { data, error } = await this.db
      .from("session")
      .select(SESSION_COLUMNS)
      .eq("pin", pin)
      .neq("status", "FINISHED")
      .maybeSingle<SessionRow>();
    if (error) fail("findActiveSessionByPin", error);
    return data ? toSession(data) : null;
  }

  async updateSessionPhase(sessionId: string, expectedVersion: number, change: PhaseChange) {
    const patch: Partial<SessionRow> = {
      status: change.status,
      current_position: change.currentPosition,
      phase_started_at: isoOrNull(change.phaseStartedAt),
      phase_ends_at: isoOrNull(change.phaseEndsAt),
      version: expectedVersion + 1,
    };
    if (change.finished) patch.finished_at = isoOrNull(change.phaseStartedAt);

    // Um único UPDATE condicional: dois cliques no botão não pulam uma fase.
    const { data, error } = await this.db
      .from("session")
      .update(patch)
      .eq("id", sessionId)
      .eq("version", expectedVersion)
      .select(SESSION_COLUMNS)
      .maybeSingle<SessionRow>();
    if (error) fail("updateSessionPhase", error);
    return data ? toSession(data) : null;
  }

  async createPlayer(input: NewPlayer) {
    const { data, error } = await this.db
      .from("player")
      .insert({
        session_id: input.sessionId,
        nickname: input.nickname,
        nickname_key: input.nicknameKey,
        token_hash: input.tokenHash,
      })
      .select(PLAYER_COLUMNS)
      .single<PlayerRow>();
    if (error?.code === UNIQUE_VIOLATION) return "nickname_taken" as const;
    if (error) fail("createPlayer", error);
    return toPlayer(data);
  }

  async getPlayerByTokenHash(tokenHash: string) {
    const { data, error } = await this.db
      .from("player")
      .select(PLAYER_COLUMNS)
      .eq("token_hash", tokenHash)
      .maybeSingle<PlayerRow>();
    if (error) fail("getPlayerByTokenHash", error);
    return data ? toPlayer(data) : null;
  }

  async listPlayers(sessionId: string) {
    const { data, error } = await this.db
      .from("player")
      .select(PLAYER_COLUMNS)
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true })
      .returns<PlayerRow[]>();
    if (error) fail("listPlayers", error);
    return data.map(toPlayer);
  }

  async countActivePlayers(sessionId: string) {
    const { count, error } = await this.db
      .from("player")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("kicked", false);
    if (error) fail("countActivePlayers", error);
    return count ?? 0;
  }

  async kickPlayer(sessionId: string, playerId: string) {
    const { data, error } = await this.db
      .from("player")
      .update({ kicked: true })
      .eq("id", playerId)
      .eq("session_id", sessionId)
      .select("id");
    if (error) fail("kickPlayer", error);
    return data.length > 0;
  }

  async touchPlayer(playerId: string, at: number) {
    const { error } = await this.db
      .from("player")
      .update({ last_seen_at: new Date(at).toISOString() })
      .eq("id", playerId);
    if (error) fail("touchPlayer", error);
  }

  async insertAnswer(sessionId: string, answer: AnswerRecord) {
    const { error } = await this.db.from("answer").insert({
      session_id: sessionId,
      question_id: answer.questionId,
      player_id: answer.playerId,
      option_id: answer.optionId,
      is_correct: answer.isCorrect,
      response_ms: answer.responseMs,
      points: answer.points,
    });
    if (error?.code === UNIQUE_VIOLATION) return "duplicate" as const;
    if (error) fail("insertAnswer", error);
    return "ok" as const;
  }

  async countAnswers(sessionId: string, questionId: string) {
    const { count, error } = await this.db
      .from("answer")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("question_id", questionId);
    if (error) fail("countAnswers", error);
    return count ?? 0;
  }

  async listAnswerOptions(sessionId: string, questionId: string) {
    const { data, error } = await this.db
      .from("answer")
      .select("option_id")
      .eq("session_id", sessionId)
      .eq("question_id", questionId)
      .returns<{ option_id: string }[]>();
    if (error) fail("listAnswerOptions", error);
    return data.map((r) => r.option_id);
  }

  async listPlayerAnswers(sessionId: string, playerId: string) {
    const { data, error } = await this.db
      .from("answer")
      .select(ANSWER_COLUMNS)
      .eq("session_id", sessionId)
      .eq("player_id", playerId)
      .returns<AnswerRow[]>();
    if (error) fail("listPlayerAnswers", error);
    return data.map(toAnswer);
  }

  async listSessionAnswers(sessionId: string) {
    // O PostgREST devolve no máximo 1000 linhas por pedido; 150 jogadores × 9
    // perguntas passa disso, então a leitura é paginada.
    const rows: AnswerRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.db
        .from("answer")
        .select(ANSWER_COLUMNS)
        .eq("session_id", sessionId)
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
        .returns<AnswerRow[]>();
      if (error) fail("listSessionAnswers", error);
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return rows.map(toAnswer);
  }

  async getStandings(sessionId: string): Promise<Standing[]> {
    const { data, error } = await this.db
      .from("player_standing")
      .select("player_id, nickname, joined_at, score, correct_count, correct_ms")
      .eq("session_id", sessionId)
      .eq("kicked", false)
      .returns<StandingRow[]>();
    if (error) fail("getStandings", error);
    return data.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      joinedAt: ms(r.joined_at),
      score: r.score,
      correctCount: r.correct_count,
      correctMs: r.correct_ms,
    }));
  }
}
