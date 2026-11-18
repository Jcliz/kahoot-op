import { describe, expect, it } from "vitest";
import { buildResultsCsv, csvField } from "./csv";
import { formatPin, isValidPin, normalizePinInput } from "./pin";
import { quizFileSchema } from "./quiz-schema";

const option = (text: string, correct = false) => ({ text, correct });
const question = (position: number, correctIndex = 0) => ({
  position,
  text: `Pergunta ${position}?`,
  options: [0, 1, 2, 3].map((i) => option(`Alternativa ${i}`, i === correctIndex)),
});

describe("quizFileSchema", () => {
  it("aceita um quiz válido e aplica os padrões", () => {
    const parsed = quizFileSchema.parse({ title: "Quiz", questions: [question(1), question(2)] });
    expect(parsed.questions[0]).toMatchObject({
      timeLimitSeconds: 20,
      pointsMultiplier: 1,
      media: null,
    });
  });

  it("recusa pergunta sem exatamente 4 alternativas", () => {
    const q = { ...question(1), options: question(1).options.slice(0, 3) };
    expect(quizFileSchema.safeParse({ title: "Quiz", questions: [q] }).success).toBe(false);
  });

  it("recusa pergunta com 0 ou 2 corretas", () => {
    const none = {
      ...question(1),
      options: question(1).options.map((o) => ({ ...o, correct: false })),
    };
    const two = {
      ...question(1),
      options: question(1).options.map((o, i) => ({ ...o, correct: i < 2 })),
    };
    expect(quizFileSchema.safeParse({ title: "Q", questions: [none] }).success).toBe(false);
    expect(quizFileSchema.safeParse({ title: "Q", questions: [two] }).success).toBe(false);
  });

  it("recusa posições com buraco ou repetidas", () => {
    expect(
      quizFileSchema.safeParse({ title: "Q", questions: [question(1), question(3)] }).success,
    ).toBe(false);
    expect(
      quizFileSchema.safeParse({ title: "Q", questions: [question(1), question(1)] }).success,
    ).toBe(false);
  });

  it("recusa mídia externa", () => {
    const q = { ...question(1), media: "https://giphy.com/x.gif" };
    expect(quizFileSchema.safeParse({ title: "Q", questions: [q] }).success).toBe(false);
  });
});

describe("PIN", () => {
  it("valida 6 dígitos sem zero à esquerda", () => {
    expect(isValidPin("482913")).toBe(true);
    expect(isValidPin("082913")).toBe(false);
    expect(isValidPin("48291")).toBe(false);
  });

  it("formata e normaliza", () => {
    expect(formatPin("482913")).toBe("482 913");
    expect(normalizePinInput(" 482-913 7")).toBe("482913");
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField('a;"b"')).toBe('"a;""b"""');
    expect(csvField(-5)).toBe("-5");
  });

  it("gera uma linha por jogador na ordem do ranking", () => {
    const csv = buildResultsCsv(
      [
        { rank: 1, playerId: "a", nickname: "Ana", score: 1900, correctCount: 2 },
        { rank: 2, playerId: "b", nickname: "Bia", score: 0, correctCount: 0 },
      ],
      [
        { playerId: "a", questionPosition: 1, isCorrect: true },
        { playerId: "a", questionPosition: 2, isCorrect: true },
        { playerId: "b", questionPosition: 1, isCorrect: false },
      ],
      2,
    );
    expect(csv).toBe(
      "\uFEFFposicao;apelido;pontos;acertos;P1;P2\r\n1;Ana;1900;2;1;1\r\n2;Bia;0;0;0;\r\n",
    );
  });
});
