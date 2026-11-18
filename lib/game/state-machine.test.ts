import { describe, expect, it } from "vitest";
import { QUESTION_INTRO_MS, transition, type PhaseSnapshot } from "./state-machine";
import { SESSION_STATUSES, type SessionStatus } from "./types";

const NOW = 1_700_000_000_000;
const ctx = { totalQuestions: 3, now: NOW, timeLimitMsAt: (p: number) => p * 10_000 };

const at = (status: SessionStatus, currentPosition = 1): PhaseSnapshot => ({
  status,
  currentPosition,
});

describe("transition: advance", () => {
  it("LOBBY → QUESTION_INTRO da pergunta 1 com 3 s de abertura", () => {
    const r = transition(at("LOBBY", 0), "advance", ctx);
    expect(r).toEqual({
      ok: true,
      next: {
        status: "QUESTION_INTRO",
        currentPosition: 1,
        phaseStartedAt: NOW,
        phaseEndsAt: NOW + QUESTION_INTRO_MS,
        finished: false,
      },
    });
  });

  it("QUESTION_INTRO → QUESTION_OPEN usando o tempo limite da pergunta", () => {
    const r = transition(at("QUESTION_INTRO", 2), "advance", ctx);
    expect(r.ok && r.next).toMatchObject({
      status: "QUESTION_OPEN",
      currentPosition: 2,
      phaseEndsAt: NOW + 20_000,
    });
  });

  it("RESULTS → LEADERBOARD quando não é a última pergunta", () => {
    const r = transition(at("RESULTS", 2), "advance", ctx);
    expect(r.ok && r.next).toMatchObject({ status: "LEADERBOARD", currentPosition: 2 });
  });

  it("RESULTS → PODIUM depois da última pergunta", () => {
    const r = transition(at("RESULTS", 3), "advance", ctx);
    expect(r.ok && r.next).toMatchObject({ status: "PODIUM", currentPosition: 3 });
  });

  it("LEADERBOARD → QUESTION_INTRO da próxima pergunta", () => {
    const r = transition(at("LEADERBOARD", 1), "advance", ctx);
    expect(r.ok && r.next).toMatchObject({
      status: "QUESTION_INTRO",
      currentPosition: 2,
      phaseEndsAt: NOW + QUESTION_INTRO_MS,
    });
  });

  it("PODIUM → FINISHED marca a sessão como encerrada", () => {
    const r = transition(at("PODIUM", 3), "advance", ctx);
    expect(r.ok && r.next).toMatchObject({ status: "FINISHED", finished: true });
  });

  it.each(["QUESTION_OPEN", "FINISHED"] as const)("recusa advance em %s", (status) => {
    expect(transition(at(status), "advance", ctx)).toEqual({ ok: false });
  });

  it("recusa iniciar um quiz sem perguntas", () => {
    expect(transition(at("LOBBY", 0), "advance", { ...ctx, totalQuestions: 0 })).toEqual({
      ok: false,
    });
  });

  it("recusa LEADERBOARD além da última pergunta", () => {
    expect(transition(at("LEADERBOARD", 3), "advance", ctx)).toEqual({ ok: false });
  });
});

describe("transition: close", () => {
  it("QUESTION_OPEN → RESULTS", () => {
    const r = transition(at("QUESTION_OPEN", 2), "close", ctx);
    expect(r.ok && r.next).toMatchObject({
      status: "RESULTS",
      currentPosition: 2,
      phaseEndsAt: null,
    });
  });

  it.each(SESSION_STATUSES.filter((s) => s !== "QUESTION_OPEN"))("recusa close em %s", (s) => {
    expect(transition(at(s), "close", ctx)).toEqual({ ok: false });
  });
});

describe("jogo completo", () => {
  it("percorre todas as fases na ordem do diagrama", () => {
    let snapshot = at("LOBBY", 0);
    const visited: string[] = [];
    for (let step = 0; step < 50 && snapshot.status !== "FINISHED"; step++) {
      const action = snapshot.status === "QUESTION_OPEN" ? "close" : "advance";
      const r = transition(snapshot, action, ctx);
      if (!r.ok) throw new Error(`transição recusada em ${snapshot.status}`);
      snapshot = r.next;
      visited.push(`${r.next.status}:${r.next.currentPosition}`);
    }
    expect(visited).toEqual([
      "QUESTION_INTRO:1",
      "QUESTION_OPEN:1",
      "RESULTS:1",
      "LEADERBOARD:1",
      "QUESTION_INTRO:2",
      "QUESTION_OPEN:2",
      "RESULTS:2",
      "LEADERBOARD:2",
      "QUESTION_INTRO:3",
      "QUESTION_OPEN:3",
      "RESULTS:3",
      "PODIUM:3",
      "FINISHED:3",
    ]);
  });
});
