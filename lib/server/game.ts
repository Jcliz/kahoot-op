import "server-only";
import quizJson from "@/content/quiz.json";
import { MemoryRepository, quizRecordFromFile } from "@/lib/db/memory";
import { SupabaseRepository } from "@/lib/db/supabase";
import { quizFileSchema } from "@/lib/game/quiz-schema";
import { NoopPublisher, SupabaseBroadcastPublisher } from "@/lib/realtime/publish";
import { getSupabaseConfig, isMemoryBackend, isStreakBonusEnabled } from "./env";
import { GameService } from "./game-service";
import { generatePin, generatePlayerToken, hashToken, signRealtimeToken } from "./tokens";

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
    const quiz = quizRecordFromFile(quizFileSchema.parse(quizJson));
    return new GameService({
      ...common,
      repo: new MemoryRepository([quiz]),
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

// Uma instância por processo. No `next dev` os módulos são recarregados,
// então a instância fica no globalThis para o modo memória não perder o jogo.
const globalForGame = globalThis as unknown as { __gameService?: GameService };

export function getGameService(): GameService {
  globalForGame.__gameService ??= createGameService();
  return globalForGame.__gameService;
}
