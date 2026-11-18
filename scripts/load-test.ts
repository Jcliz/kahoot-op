/**
 * Teste de carga (Fase 6): N clientes entram, assinam o canal e respondem numa
 * janela aleatória de 1 a 15 s, enquanto o script faz o papel do apresentador.
 *
 *   npm run load-test -- --url=https://seu-app.vercel.app --clients=150 --questions=3
 *
 * Mede e registra:
 *  - atraso entre o advance do apresentador e a chegada do `state` em cada cliente (meta p95 ≤ 1 s)
 *  - tempo de resposta de POST /api/answer (meta p95 ≤ 500 ms) e taxa de erro (meta 0%)
 *  - desconexões do tempo real (CHANNEL_ERROR / TIMED_OUT / CLOSED)
 *  - acertos finais de cada jogador iguais aos calculados de forma independente pelo script
 */
import { config as loadEnv } from "dotenv";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import {
  sessionTopic,
  type GameState,
  type RealtimeAccess,
  type SessionStatus,
} from "../lib/game/types";
import { ApiError, HostClient, PlayerClient } from "./api-client";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const BASE_URL = arg("url", "http://localhost:3000");
const CLIENTS = Number(arg("clients", "150"));
const QUESTIONS = Number(arg("questions", "3"));
const JOIN_CONCURRENCY = 25;
const ANSWER_WINDOW_MS: [number, number] = [1_000, 15_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomBetween = ([min, max]: [number, number]) => min + Math.random() * (max - min);

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const metrics = {
  joinErrors: 0,
  answerLatencies: [] as number[],
  answerErrors: [] as string[],
  stateLatencies: [] as number[],
  disconnects: 0,
};

/** Momento (relógio local) em que o apresentador pediu cada versão. */
const advancedAt = new Map<number, number>();

class LoadClient {
  readonly player: PlayerClient;
  /** opção escolhida por pergunta (id da pergunta → id da opção) */
  readonly choices = new Map<string, string>();
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private lastVersion = 0;

  constructor(
    index: number,
    private readonly sessionId: string,
  ) {
    this.player = new PlayerClient(BASE_URL, `Carga ${String(index + 1).padStart(3, "0")}`);
  }

  async join(pin: string) {
    await this.player.join(pin);
    const { realtime } = await this.player.state();
    if (realtime) await this.subscribe(realtime);
  }

  private subscribe(access: RealtimeAccess) {
    this.supabase = createClient(access.url, access.anonKey, {
      accessToken: async () => access.token,
    });
    return new Promise<void>((resolve) => {
      this.channel = this.supabase!.channel(sessionTopic(this.sessionId), {
        config: { private: true },
      })
        .on("broadcast", { event: "state" }, ({ payload }) => this.onState(payload as GameState))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          else {
            metrics.disconnects += 1;
            resolve();
          }
        });
    });
  }

  private onState(state: GameState) {
    if (state.version <= this.lastVersion) return;
    this.lastVersion = state.version;
    const sentAt = advancedAt.get(state.version);
    if (sentAt) metrics.stateLatencies.push(Date.now() - sentAt);
  }

  async answer(state: GameState) {
    const question = state.question!;
    await sleep(randomBetween(ANSWER_WINDOW_MS));
    const option = question.options[Math.floor(Math.random() * question.options.length)];
    const started = Date.now();
    try {
      await this.player.answer(question.id, option.id);
      metrics.answerLatencies.push(Date.now() - started);
      this.choices.set(question.id, option.id);
    } catch (error) {
      // Resposta depois do fechamento automático (todos responderam) não é erro do servidor.
      if (error instanceof ApiError && error.code === "QUESTION_NOT_OPEN") return;
      metrics.answerErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  async close() {
    if (this.channel) await this.supabase?.removeChannel(this.channel);
    this.supabase?.realtime.disconnect();
  }
}

async function waitForStatus(host: HostClient, sessionId: string, statuses: SessionStatus[]) {
  for (;;) {
    const response = await host.state(sessionId);
    if (statuses.includes(response.state.status)) return response;
    await sleep(250);
  }
}

async function advance(host: HostClient, sessionId: string, version: number) {
  advancedAt.set(version + 1, Date.now());
  return host.advance(sessionId, version);
}

async function main() {
  const password = process.env.HOST_PASSWORD;
  if (!password) throw new Error("Defina HOST_PASSWORD no .env.local");

  const host = new HostClient(BASE_URL);
  await host.login(password);
  const { sessionId, pin } = await host.createSession();
  console.log(`Sessão ${sessionId} (PIN ${pin}) · ${CLIENTS} clientes · ${BASE_URL}`);

  const clients = Array.from({ length: CLIENTS }, (_, i) => new LoadClient(i, sessionId));
  for (let i = 0; i < clients.length; i += JOIN_CONCURRENCY) {
    await Promise.all(
      clients.slice(i, i + JOIN_CONCURRENCY).map(async (c) => {
        try {
          await c.join(pin);
        } catch (error) {
          metrics.joinErrors += 1;
          console.error("join:", error instanceof Error ? error.message : error);
        }
      }),
    );
  }
  const joined = clients.filter((c) => c.player.token);
  console.log(`${joined.length} entraram (${metrics.joinErrors} erros)`);

  let { state } = await host.state(sessionId);
  const totalQuestions = Math.min(QUESTIONS, state.totalQuestions);
  const correctByQuestion = new Map<string, string>();

  for (let q = 1; q <= totalQuestions; q++) {
    state = await advance(host, sessionId, state.version); // → QUESTION_INTRO
    await sleep(3_000);
    state = await advance(host, sessionId, state.version); // → QUESTION_OPEN
    console.log(`Pergunta ${q}: aberta`);

    const answering = Promise.all(joined.map((c) => c.answer(state)));
    const closed = waitForStatus(host, sessionId, ["RESULTS"]);
    // Fecha por tempo se alguém não respondeu (como o telão faria). Usa a versão
    // desta pergunta: se ela já fechou, o servidor ignora o pedido.
    const openVersion = state.version;
    const timeout = sleep(state.question!.timeLimitS * 1000 + 600).then(() =>
      host.closeQuestion(sessionId, openVersion, "timeout"),
    );
    await answering;
    await Promise.race([closed, timeout]);
    const results = await waitForStatus(host, sessionId, ["RESULTS"]);
    state = results.state;
    correctByQuestion.set(state.question!.id, state.results!.correctOptionId);
    console.log(`  resultado: ${state.results!.counts.join(" / ")}`);

    // Pico de GET /api/state com atraso aleatório de 0 a 300 ms, como os celulares fazem.
    await Promise.all(
      joined.map(async (c) => {
        await sleep(Math.random() * 300);
        try {
          await c.player.state();
        } catch (error) {
          metrics.answerErrors.push(`state: ${(error as Error).message}`);
        }
      }),
    );

    if (q < totalQuestions) state = await advance(host, sessionId, state.version); // LEADERBOARD
  }

  // Encerra: placar final
  const final = await host.state(sessionId);
  const standings = new Map<string, number>();
  await Promise.all(
    joined.map(async (c) => {
      const { me } = await c.player.state();
      standings.set(c.player.playerId, me.correctCount);
    }),
  );
  let mismatches = 0;
  for (const c of joined) {
    const expected = [...c.choices].filter(
      ([qid, oid]) => correctByQuestion.get(qid) === oid,
    ).length;
    if (standings.get(c.player.playerId) !== expected) mismatches += 1;
  }

  await Promise.all(clients.map((c) => c.close()));

  const p95Answer = percentile(metrics.answerLatencies, 95);
  const p95State = percentile(metrics.stateLatencies, 95);
  const answerTotal = metrics.answerLatencies.length + metrics.answerErrors.length;
  const errorRate = answerTotal ? metrics.answerErrors.length / answerTotal : 0;

  console.log("\n=== Resultado ===");
  console.log(`Fase final no telão: ${final.state.status}`);
  console.log(
    `POST /api/answer: ${metrics.answerLatencies.length} ok, p50 ${percentile(metrics.answerLatencies, 50)} ms, p95 ${p95Answer} ms (meta ≤ 500)`,
  );
  console.log(`Erros: ${metrics.answerErrors.length} (${(errorRate * 100).toFixed(2)}%, meta 0%)`);
  console.log(
    Number.isNaN(p95State)
      ? "Tempo real: não configurado (modo memória), latência do state não medida"
      : `advance → state: ${metrics.stateLatencies.length} entregas, p95 ${p95State} ms (meta ≤ 1000)`,
  );
  console.log(`Desconexões do tempo real: ${metrics.disconnects}`);
  console.log(`Acertos divergentes do cálculo independente: ${mismatches}`);
  for (const e of metrics.answerErrors.slice(0, 10)) console.log(`  erro: ${e}`);

  const pass =
    metrics.joinErrors === 0 &&
    metrics.answerErrors.length === 0 &&
    p95Answer <= 500 &&
    (Number.isNaN(p95State) || p95State <= 1000) &&
    mismatches === 0;
  console.log(pass ? "\n✓ Passou nas metas" : "\n✗ Não passou nas metas");
  if (!pass) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
