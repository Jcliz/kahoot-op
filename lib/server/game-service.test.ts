import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository, quizRecordFromFile } from "@/lib/db/memory";
import type { QuizRecord } from "@/lib/db/repository";
import { GameError, type GameErrorCode } from "@/lib/game/errors";
import { QUESTION_INTRO_MS } from "@/lib/game/state-machine";
import type { GameState } from "@/lib/game/types";
import { RecordingPublisher } from "@/lib/realtime/publish";
import { GameService } from "./game-service";

const T0 = 1_800_000_000_000;

function makeQuiz(): QuizRecord {
  const question = (position: number, correctIndex: number) => ({
    position,
    text: `Pergunta ${position}?`,
    media: null,
    timeLimitSeconds: 20,
    pointsMultiplier: 1,
    options: [0, 1, 2, 3].map((i) => ({
      text: `Alt ${position}.${i}`,
      correct: i === correctIndex,
    })),
  });
  return quizRecordFromFile({ title: "Teste", questions: [question(1, 1), question(2, 2)] });
}

interface Harness {
  service: GameService;
  repo: MemoryRepository;
  publisher: RecordingPublisher;
  quiz: QuizRecord;
  clock: { now: number };
}

function setup(options: { streakBonus?: boolean } = {}): Harness {
  const quiz = makeQuiz();
  const repo = new MemoryRepository([quiz]);
  const publisher = new RecordingPublisher();
  const clock = { now: T0 };
  let pins = 100_000;
  let tokens = 0;
  const service = new GameService({
    repo,
    publisher,
    generatePin: () => String(++pins),
    generateToken: () => `token-${++tokens}-${"x".repeat(24)}`,
    hashToken: (t) => createHash("sha256").update(t).digest("hex"),
    realtimeAccess: async () => null,
    streakBonus: options.streakBonus,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  });
  return { service, repo, publisher, quiz, clock };
}

async function expectGameError(promise: Promise<unknown>, code: GameErrorCode) {
  await expect(promise).rejects.toSatisfy((e) => e instanceof GameError && e.code === code);
}

/** Avança até a pergunta abrir e devolve o estado. */
async function openQuestion(h: Harness, sessionId: string): Promise<GameState> {
  let host = await h.service.getHostState(sessionId);
  while (host.state.status !== "QUESTION_OPEN") {
    await h.service.advance(sessionId, host.state.version);
    host = await h.service.getHostState(sessionId);
  }
  return host.state;
}

const optionAt = (state: GameState, position: number) =>
  state.question!.options.find((o) => o.position === position)!.id;

describe("GameService", () => {
  let h: Harness;
  let sessionId: string;
  let pin: string;

  beforeEach(async () => {
    h = setup();
    ({ sessionId, pin } = await h.service.createSession());
  });

  describe("entrada", () => {
    it("entra com PIN e apelido e avisa o telão", async () => {
      const joined = await h.service.join(pin, "  Zé da Obra ");
      expect(joined.sessionId).toBe(sessionId);
      const host = await h.service.getHostState(sessionId);
      expect(host.players).toEqual([{ id: joined.playerId, nickname: "Zé da Obra" }]);
      expect(h.publisher.messages.at(-1)).toMatchObject({
        topic: `host:${sessionId}`,
        event: "lobby",
      });
    });

    it("recusa PIN inexistente ou malformado", async () => {
      await expectGameError(h.service.join("999999", "Ana"), "SESSION_NOT_FOUND");
      await expectGameError(h.service.join("12", "Ana"), "SESSION_NOT_FOUND");
    });

    it("recusa apelido repetido sem acento e sem maiúsculas", async () => {
      await h.service.join(pin, "Joãozinho");
      await expectGameError(h.service.join(pin, "JOAOZINHO"), "NICKNAME_TAKEN");
    });

    it("recusa apelido inválido ou ofensivo", async () => {
      await expectGameError(h.service.join(pin, "a"), "NICKNAME_INVALID");
      await expectGameError(h.service.join(pin, "P0rr4"), "NICKNAME_BLOCKED");
    });

    it("recusa entrada com o jogo em andamento", async () => {
      await h.service.advance(sessionId, 1);
      await expectGameError(h.service.join(pin, "Atrasado"), "GAME_ALREADY_STARTED");
    });
  });

  describe("transições", () => {
    it("dois cliques com a mesma versão não pulam fase", async () => {
      await h.service.join(pin, "Ana");
      const first = await h.service.advance(sessionId, 1);
      expect(first.status).toBe("QUESTION_INTRO");
      await expectGameError(h.service.advance(sessionId, 1), "STALE_VERSION");
      expect((await h.service.getHostState(sessionId)).state.status).toBe("QUESTION_INTRO");
    });

    it("recusa advance com a pergunta aberta", async () => {
      await h.service.join(pin, "Ana");
      const open = await openQuestion(h, sessionId);
      await expectGameError(h.service.advance(sessionId, open.version), "INVALID_TRANSITION");
    });

    it("publica o retrato completo a cada mudança de fase, com versão crescente", async () => {
      await h.service.join(pin, "Ana");
      await openQuestion(h, sessionId);
      const states = h.publisher.messages.filter((m) => m.event === "state");
      expect(states.map((m) => (m.payload as GameState).status)).toEqual([
        "QUESTION_INTRO",
        "QUESTION_OPEN",
      ]);
      expect(states.map((m) => (m.payload as GameState).version)).toEqual([2, 3]);
    });

    it("close-question é idempotente", async () => {
      await h.service.join(pin, "Ana");
      const open = await openQuestion(h, sessionId);
      const a = await h.service.closeQuestion(sessionId, "manual", open.version);
      const b = await h.service.closeQuestion(sessionId, "manual", open.version);
      expect(a.status).toBe("RESULTS");
      expect(b).toMatchObject({ status: "RESULTS", version: a.version });
    });

    it("fechar por tempo espera a tolerância de rede", async () => {
      await h.service.join(pin, "Ana");
      const open = await openQuestion(h, sessionId);
      h.clock.now = open.phaseEndsAt!;
      await h.service.closeQuestion(sessionId, "timeout", open.version);
      expect(h.clock.now).toBe(open.phaseEndsAt! + 500);
    });
  });

  describe("respostas", () => {
    let ana: { token: string; playerId: string };
    let bia: { token: string; playerId: string };

    beforeEach(async () => {
      ana = await h.service.join(pin, "Ana");
      bia = await h.service.join(pin, "Bia");
    });

    it("o gabarito não sai do servidor antes de RESULTS", async () => {
      const open = await openQuestion(h, sessionId);
      const asPlayer = await h.service.getPlayerState(ana.token);
      for (const payload of [open, asPlayer, ...h.publisher.messages.map((m) => m.payload)]) {
        const json = JSON.stringify(payload);
        expect(json).not.toMatch(/isCorrect|correctOptionId|correctPosition/);
      }
    });

    it("calcula pontos no servidor pelo horário de chegada", async () => {
      const open = await openQuestion(h, sessionId);
      h.clock.now = open.phaseStartedAt! + 10_000;
      await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1));
      const answers = await h.repo.listPlayerAnswers(sessionId, ana.playerId);
      expect(answers[0]).toMatchObject({ isCorrect: true, responseMs: 10_000, points: 750 });
    });

    it("recusa resposta duplicada, de outra pergunta, ou fora do tempo", async () => {
      const open = await openQuestion(h, sessionId);
      await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 0));
      await expectGameError(
        h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1)),
        "ALREADY_ANSWERED",
      );
      const q2 = h.quiz.questions[1];
      await expectGameError(
        h.service.submitAnswer(bia.token, q2.id, q2.options[0].id),
        "QUESTION_NOT_OPEN",
      );
      await expectGameError(
        h.service.submitAnswer(bia.token, open.question!.id, q2.options[0].id),
        "OPTION_NOT_FOUND",
      );
      h.clock.now = open.phaseEndsAt! + 501;
      await expectGameError(
        h.service.submitAnswer(bia.token, open.question!.id, optionAt(open, 1)),
        "ANSWER_TOO_LATE",
      );
    });

    it("aceita na tolerância de 500 ms com t = T", async () => {
      const open = await openQuestion(h, sessionId);
      h.clock.now = open.phaseEndsAt! + 400;
      await h.service.submitAnswer(bia.token, open.question!.id, optionAt(open, 1));
      const [answer] = await h.repo.listPlayerAnswers(sessionId, bia.playerId);
      expect(answer).toMatchObject({ responseMs: 20_000, points: 500 });
    });

    it("recusa resposta fora de QUESTION_OPEN", async () => {
      await h.service.advance(sessionId, 1);
      const q1 = h.quiz.questions[0];
      await expectGameError(
        h.service.submitAnswer(ana.token, q1.id, q1.options[0].id),
        "QUESTION_NOT_OPEN",
      );
    });

    it("fecha sozinho quando todos respondem e mostra o contador ao telão", async () => {
      const open = await openQuestion(h, sessionId);
      await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1));
      expect(h.publisher.messages.at(-1)).toMatchObject({
        event: "answer_count",
        payload: { answered: 1, total: 2 },
      });
      await h.service.submitAnswer(bia.token, open.question!.id, optionAt(open, 3));
      const state = (await h.service.getHostState(sessionId)).state;
      expect(state.status).toBe("RESULTS");
      expect(state.results).toMatchObject({ counts: [0, 1, 0, 1], correctPosition: 1 });
    });

    it("fecha sozinho se o telão sumir depois do tempo", async () => {
      const open = await openQuestion(h, sessionId);
      h.clock.now = open.phaseEndsAt! + 5_000;
      const { state } = await h.service.getPlayerState(ana.token);
      expect(state.status).toBe("RESULTS");
    });

    it("remover um jogador tira ele do jogo e pode fechar a pergunta", async () => {
      const open = await openQuestion(h, sessionId);
      await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1));
      await h.service.kick(sessionId, bia.playerId);
      await expectGameError(h.service.getPlayerState(bia.token), "PLAYER_KICKED");
      expect(h.publisher.messages).toContainEqual({
        topic: `session:${sessionId}`,
        event: "kicked",
        payload: { playerId: bia.playerId },
      });
      expect((await h.service.getHostState(sessionId)).state.status).toBe("RESULTS");
    });
  });

  it("jogo completo: resultado individual, ranking, pódio e CSV", async () => {
    const ana = await h.service.join(pin, "Ana");
    const bia = await h.service.join(pin, "Bia");
    const caio = await h.service.join(pin, "Caio");

    // Pergunta 1 (correta: posição 1)
    let open = await openQuestion(h, sessionId);
    h.clock.now = open.phaseStartedAt! + 2_000;
    await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1)); // 950
    h.clock.now = open.phaseStartedAt! + 4_000;
    await h.service.submitAnswer(bia.token, open.question!.id, optionAt(open, 1)); // 900
    await h.service.submitAnswer(caio.token, open.question!.id, optionAt(open, 0)); // 0

    let me = (await h.service.getPlayerState(bia.token)).me;
    expect(me).toMatchObject({
      score: 900,
      rank: 2,
      totalPlayers: 3,
      lastResult: { answered: true, correct: true, points: 900 },
      ahead: { rank: 1, gap: 51 },
    });

    let host = await h.service.getHostState(sessionId);
    const leaderboard = await h.service.advance(sessionId, host.state.version);
    expect(leaderboard.top5?.map((e) => e.nickname)).toEqual(["Ana", "Bia", "Caio"]);

    // Pergunta 2 (correta: posição 2); Ana não responde
    await h.service.advance(sessionId, leaderboard.version);
    h.clock.now += QUESTION_INTRO_MS;
    open = await openQuestion(h, sessionId);
    h.clock.now = open.phaseStartedAt! + 1_000;
    await h.service.submitAnswer(bia.token, open.question!.id, optionAt(open, 2)); // 975
    await h.service.submitAnswer(caio.token, open.question!.id, optionAt(open, 2)); // 975
    host = await h.service.getHostState(sessionId);
    expect(host.state.status).toBe("QUESTION_OPEN");
    const results = await h.service.closeQuestion(sessionId, "manual", host.state.version);

    me = (await h.service.getPlayerState(ana.token)).me;
    expect(me.lastResult).toEqual({
      questionId: open.question!.id,
      answered: false,
      correct: false,
      points: 0,
    });

    // Última pergunta → pódio → fim
    const podium = await h.service.advance(sessionId, results.version);
    expect(podium.status).toBe("PODIUM");
    expect(podium.podium?.map((e) => [e.nickname, e.score])).toEqual([
      ["Bia", 1875],
      ["Caio", 975],
      ["Ana", 950],
    ]);
    const finished = await h.service.advance(sessionId, podium.version);
    expect(finished.status).toBe("FINISHED");
    await expectGameError(h.service.advance(sessionId, finished.version), "INVALID_TRANSITION");

    host = await h.service.getHostState(sessionId);
    expect(host.ranking?.map((e) => e.rank)).toEqual([1, 2, 3]);

    const csv = await h.service.exportCsv(sessionId);
    expect(csv.split("\r\n").slice(0, 4)).toEqual([
      "﻿posicao;apelido;pontos;acertos;P1;P2",
      "1;Bia;1875;2;1;1",
      "2;Caio;975;1;0;1",
      "3;Ana;950;1;1;",
    ]);
  });

  it("bônus de sequência quando a flag está ligada", async () => {
    h = setup({ streakBonus: true });
    ({ sessionId, pin } = await h.service.createSession());
    const ana = await h.service.join(pin, "Ana");

    let open = await openQuestion(h, sessionId);
    h.clock.now = open.phaseStartedAt!;
    await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 1)); // 1000, fecha
    let host = await h.service.getHostState(sessionId);
    await h.service.advance(sessionId, host.state.version); // leaderboard
    host = await h.service.getHostState(sessionId);
    await h.service.advance(sessionId, host.state.version); // intro 2
    open = await openQuestion(h, sessionId);
    h.clock.now = open.phaseStartedAt!;
    await h.service.submitAnswer(ana.token, open.question!.id, optionAt(open, 2)); // 1000 + 100

    const answers = await h.repo.listPlayerAnswers(sessionId, ana.playerId);
    expect(answers.map((a) => a.points)).toEqual([1000, 1100]);
  });
});
