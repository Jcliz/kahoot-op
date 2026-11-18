/**
 * Roda um jogo inteiro chamando só a API (critério da Fase 2).
 *
 *   npm run simulate                                  5 jogadores em http://localhost:3000
 *   npm run simulate -- --url=https://... --players=20
 *
 * Usa HOST_PASSWORD do .env.local. No fim confere se o CSV bate com o ranking.
 */
import { config as loadEnv } from "dotenv";
import { HostClient, PlayerClient } from "./api-client";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const BASE_URL = arg("url", "http://localhost:3000");
const PLAYERS = Number(arg("players", "5"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const password = process.env.HOST_PASSWORD;
  if (!password) throw new Error("Defina HOST_PASSWORD no .env.local");

  const host = new HostClient(BASE_URL);
  await host.login(password);
  const { sessionId, pin } = await host.createSession();
  console.log(`Sessão ${sessionId} criada com PIN ${pin}`);

  const players = Array.from(
    { length: PLAYERS },
    (_, i) => new PlayerClient(BASE_URL, `Robô ${i + 1}`),
  );
  await Promise.all(players.map((p) => p.join(pin)));
  console.log(`${players.length} jogadores entraram`);

  for (;;) {
    const { state } = await host.state(sessionId);
    const label = state.position
      ? `${state.status} ${state.position}/${state.totalQuestions}`
      : state.status;
    console.log(`→ ${label}`);

    if (state.status === "FINISHED") break;

    if (state.status === "QUESTION_OPEN") {
      await Promise.all(
        players.map(async (p, i) => {
          if (i === players.length - 1) return; // um jogador nunca responde
          await sleep(Math.random() * 1_500);
          const { state: s } = await p.state();
          const option = s.question!.options[Math.floor(Math.random() * 4)];
          await p.answer(s.question!.id, option.id);
        }),
      );
      const after = await host.state(sessionId);
      console.log(`  ${after.answerCount.answered} de ${after.answerCount.total} responderam`);
      if (after.state.status === "QUESTION_OPEN") {
        await host.closeQuestion(sessionId, after.state.version, "manual");
      }
      continue;
    }

    if (state.status === "RESULTS") {
      const [me] = await Promise.all([players[0].state()]);
      console.log(
        `  contagem: ${state.results?.counts.join(" / ")} · ${players[0].nickname}: ${me.me.rank}º, ${me.me.score} pts`,
      );
    }
    await host.advance(sessionId, state.version);
  }

  const { ranking } = await host.state(sessionId);
  console.log("\nRanking final:");
  for (const e of ranking ?? [])
    console.log(`  ${e.rank}º ${e.nickname} — ${e.score} pts (${e.correctCount} acertos)`);

  const csv = await host.exportCsv(sessionId);
  const rows = csv
    .replace(/^﻿/, "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(";"));
  const matches =
    rows.length === ranking?.length &&
    rows.every((r, i) => r[1] === ranking[i].nickname && Number(r[2]) === ranking[i].score);
  console.log(matches ? "\n✓ CSV bate com o ranking final" : "\n✗ CSV diferente do ranking final");
  if (!matches) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
