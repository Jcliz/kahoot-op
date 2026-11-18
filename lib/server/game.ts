import "server-only";
import quizJson from "@/content/quiz.json";
import { MemoryRepository, quizRecordFromFile } from "@/lib/db/memory";
import { SupabaseRepository } from "@/lib/db/supabase";
import { quizFileSchema } from "@/lib/game/quiz-schema";
import { NoopPublisher, SupabaseBroadcastPublisher } from "@/lib/realtime/publish";
import { getSupabaseConfig, isMemoryBackend, isStreakBonusEnabled } from "./env";
import { GameService } from "./game-service";
import { generatePin, generatePlayerToken, hashToken, signRealtimeToken } from "./tokens";

/**
 * No modo memória os DADOS (sessões, jogadores, respostas) ficam no globalThis para
 * sobreviver às recargas de código do `next dev`. O serviço, não: ele é recriado
 * a cada recarga, então mudanças nas regras valem na hora, sem perder a partida.
 * Se o content/quiz.json mudar, entra como uma versão nova do quiz (igual ao seed).
 */
const memoryStore = globalThis as unknown as {
  __quizMemory?: { repo: MemoryRepository; quizContent: string };
};

function getMemoryRepository(): MemoryRepository {
  const quizContent = JSON.stringify(quizJson);
  const current = memoryStore.__quizMemory;
  if (current && current.quizContent === quizContent) return current.repo;

  const quiz = quizRecordFromFile(quizFileSchema.parse(quizJson));
  const repo = current?.repo ?? new MemoryRepository();
  repo.addQuiz(quiz);
  memoryStore.__quizMemory = { repo, quizContent };
  return repo;
}

function createGameService(): GameService {
  const common = {
    generatePin,
    generateToken: generatePlayerToken,
    hashToken,
    streakBonus: isStreakBonusEnabled(),
  };

  if (isMemoryBackend()) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error("DATA_BACKEND=memory não funciona na Vercel: use o Supabase.");
    }
    return new GameService({
      ...common,
      repo: getMemoryRepository(),
      publisher: new NoopPublisher(),
      realtimeAccess: async () => null,
    });
  }

  const config = getSupabaseConfig();
  return new GameService({
    ...common,
    repo: new SupabaseRepository(config.url, config.serviceRoleKey),
    publisher: new SupabaseBroadcastPublisher(config.url, config.serviceRoleKey),
    realtimeAccess: async ({ sessionId, subject, isHost }) => ({
      url: config.url,
      anonKey: config.anonKey,
      token: await signRealtimeToken(config.jwtSecret, { sessionId, subject, isHost }),
    }),
  });
}

// Uma instância por carga do módulo (em produção, uma por processo).
let service: GameService | undefined;

export function getGameService(): GameService {
  service ??= createGameService();
  return service;
}
