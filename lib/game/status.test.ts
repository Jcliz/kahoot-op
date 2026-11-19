import { describe, expect, it } from "vitest";
import { isGameOver, STALE_PODIUM_MS } from "./status";

const at = (status: Parameters<typeof isGameOver>[0]["status"], ageMs: number) => ({
  status,
  phaseStartedAt: 1_000_000,
  serverNow: 1_000_000 + ageMs,
});

describe("isGameOver", () => {
  it("FINISHED acabou", () => {
    expect(isGameOver(at("FINISHED", 0))).toBe(true);
  });

  it("pódio recente ainda vale (participante pode recarregar)", () => {
    expect(isGameOver(at("PODIUM", 60_000))).toBe(false);
  });

  it("pódio abandonado conta como encerrado", () => {
    expect(isGameOver(at("PODIUM", STALE_PODIUM_MS + 1))).toBe(true);
  });

  it("fases do jogo nunca contam como encerrado", () => {
    for (const status of [
      "LOBBY",
      "QUESTION_INTRO",
      "QUESTION_OPEN",
      "RESULTS",
      "LEADERBOARD",
    ] as const) {
      expect(isGameOver(at(status, STALE_PODIUM_MS * 10))).toBe(false);
    }
  });
});
