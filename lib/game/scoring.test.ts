import { describe, expect, it } from "vitest";
import {
  ANSWER_GRACE_MS,
  computePoints,
  computeStandings,
  rankStandings,
  resolveResponseTime,
  streakBefore,
  streakBonus,
  type Standing,
} from "./scoring";

const T = 20_000;

describe("computePoints", () => {
  it("resposta instantânea vale 1000", () => {
    expect(computePoints({ isCorrect: true, responseMs: 0, timeLimitMs: T, multiplier: 1 })).toBe(
      1000,
    );
  });

  it("resposta no último instante vale 500", () => {
    expect(computePoints({ isCorrect: true, responseMs: T, timeLimitMs: T, multiplier: 1 })).toBe(
      500,
    );
  });

  it("metade do tempo vale 750", () => {
    expect(
      computePoints({ isCorrect: true, responseMs: T / 2, timeLimitMs: T, multiplier: 1 }),
    ).toBe(750);
  });

  it("arredonda: t = 3,1 s em 20 s → 923", () => {
    // 1000 × (1 − 3100/40000) = 922,5 → 923
    expect(
      computePoints({ isCorrect: true, responseMs: 3_100, timeLimitMs: T, multiplier: 1 }),
    ).toBe(923);
  });

  it("pergunta valendo dobro", () => {
    expect(computePoints({ isCorrect: true, responseMs: 0, timeLimitMs: T, multiplier: 2 })).toBe(
      2000,
    );
  });

  it("errada vale 0, mesmo com bônus", () => {
    expect(
      computePoints({ isCorrect: false, responseMs: 0, timeLimitMs: T, multiplier: 1, bonus: 300 }),
    ).toBe(0);
  });

  it("soma o bônus de sequência", () => {
    expect(
      computePoints({ isCorrect: true, responseMs: T, timeLimitMs: T, multiplier: 1, bonus: 200 }),
    ).toBe(700);
  });

  it("t fora do intervalo é limitado a [0, T]", () => {
    expect(computePoints({ isCorrect: true, responseMs: -50, timeLimitMs: T, multiplier: 1 })).toBe(
      1000,
    );
    expect(
      computePoints({ isCorrect: true, responseMs: T * 3, timeLimitMs: T, multiplier: 1 }),
    ).toBe(500);
  });
});

describe("resolveResponseTime", () => {
  const start = 1_000_000;
  const end = start + T;

  it("mede a partir do início da fase", () => {
    expect(resolveResponseTime(start + 4_321, start, end)).toEqual({
      accepted: true,
      responseMs: 4_321,
    });
  });

  it("aceita na tolerância com t = T", () => {
    expect(resolveResponseTime(end + ANSWER_GRACE_MS, start, end)).toEqual({
      accepted: true,
      responseMs: T,
    });
  });

  it("recusa depois da tolerância", () => {
    expect(resolveResponseTime(end + ANSWER_GRACE_MS + 1, start, end)).toEqual({
      accepted: false,
    });
  });

  it("relógio adiantado não gera tempo negativo", () => {
    expect(resolveResponseTime(start - 10, start, end)).toEqual({ accepted: true, responseMs: 0 });
  });
});

describe("streak", () => {
  it("conta acertos seguidos imediatamente antes", () => {
    const answers = new Map([
      [1, true],
      [2, false],
      [3, true],
      [4, true],
    ]);
    expect(streakBefore(5, answers)).toBe(2);
    expect(streakBefore(3, answers)).toBe(0);
    expect(streakBefore(1, answers)).toBe(0);
  });

  it("pergunta sem resposta quebra a sequência", () => {
    const answers = new Map([
      [1, true],
      [3, true],
    ]);
    expect(streakBefore(4, answers)).toBe(1);
  });

  it("bônus: +100 a partir do 2º acerto seguido, limitado a +500", () => {
    expect([0, 1, 2, 5, 9].map(streakBonus)).toEqual([0, 100, 200, 500, 500]);
  });
});

describe("ranking e desempate", () => {
  const base: Standing = {
    playerId: "x",
    nickname: "x",
    joinedAt: 0,
    score: 0,
    correctCount: 0,
    correctMs: 0,
  };
  const s = (patch: Partial<Standing>): Standing => ({ ...base, ...patch });

  it("ordena por pontos, depois acertos, depois tempo, depois entrada", () => {
    const ranked = rankStandings([
      s({ playerId: "e", score: 900, correctCount: 1, correctMs: 100, joinedAt: 5 }),
      s({ playerId: "d", score: 900, correctCount: 1, correctMs: 100, joinedAt: 4 }),
      s({ playerId: "c", score: 900, correctCount: 1, correctMs: 50 }),
      s({ playerId: "b", score: 900, correctCount: 2 }),
      s({ playerId: "a", score: 1000 }),
    ]);
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
      ["e", 5],
    ]);
  });

  it("nunca há empate, nem com tudo igual", () => {
    const ranked = rankStandings([s({ playerId: "b" }), s({ playerId: "a" })]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("computeStandings soma pontos, acertos e tempo nas corretas", () => {
    const standings = computeStandings(
      [
        { id: "p1", nickname: "Ana", joinedAt: 1 },
        { id: "p2", nickname: "Bia", joinedAt: 2 },
      ],
      [
        { playerId: "p1", isCorrect: true, responseMs: 1_000, points: 975 },
        { playerId: "p1", isCorrect: false, responseMs: 2_000, points: 0 },
        { playerId: "p1", isCorrect: true, responseMs: 3_000, points: 925 },
        { playerId: "ghost", isCorrect: true, responseMs: 0, points: 1000 },
      ],
    );
    expect(standings).toEqual([
      {
        playerId: "p1",
        nickname: "Ana",
        joinedAt: 1,
        score: 1900,
        correctCount: 2,
        correctMs: 4000,
      },
      { playerId: "p2", nickname: "Bia", joinedAt: 2, score: 0, correctCount: 0, correctMs: 0 },
    ]);
  });
});
