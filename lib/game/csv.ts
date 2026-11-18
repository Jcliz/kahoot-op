import type { RankEntry } from "./types";

export interface CsvAnswer {
  playerId: string;
  questionPosition: number;
  isCorrect: boolean;
}

const SEPARATOR = ";"; // padrão do Excel em pt-BR
const BOM = "﻿"; // faz o Excel abrir o arquivo como UTF-8

/** Escapa o campo e neutraliza fórmulas (apelido começando com =, +, - ou @). */
export function csvField(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Uma linha por participante, na ordem do ranking: posição, apelido, pontos,
 * acertos e uma coluna por pergunta (1 = acertou, 0 = errou, vazio = não respondeu).
 */
export function buildResultsCsv(
  ranking: readonly RankEntry[],
  answers: readonly CsvAnswer[],
  totalQuestions: number,
): string {
  const byPlayer = new Map<string, Map<number, boolean>>();
  for (const a of answers) {
    const row = byPlayer.get(a.playerId) ?? new Map<number, boolean>();
    row.set(a.questionPosition, a.isCorrect);
    byPlayer.set(a.playerId, row);
  }

  const questionColumns = Array.from({ length: totalQuestions }, (_, i) => `P${i + 1}`);
  const header = ["posicao", "apelido", "pontos", "acertos", ...questionColumns];

  const lines = ranking.map((entry) => {
    const row = byPlayer.get(entry.playerId);
    const perQuestion = questionColumns.map((_, i) => {
      const correct = row?.get(i + 1);
      return correct === undefined ? "" : correct ? "1" : "0";
    });
    return [entry.rank, entry.nickname, entry.score, entry.correctCount, ...perQuestion]
      .map(csvField)
      .join(SEPARATOR);
  });

  return BOM + [header.join(SEPARATOR), ...lines].join("\r\n") + "\r\n";
}
