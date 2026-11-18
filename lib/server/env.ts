import { z } from "zod";

/** Trata variável vazia ("FOO=") como ausente. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

const envSchema = z.object({
  DATA_BACKEND: optional(z.enum(["supabase", "memory"])).transform((v) => v ?? "supabase"),
  NEXT_PUBLIC_SUPABASE_URL: optional(z.url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),
  SUPABASE_JWT_SECRET: optional(z.string().min(32)),
  HOST_PASSWORD: optional(z.string().min(1)),
  HOST_SESSION_SECRET: optional(z.string().min(32)),
  STREAK_BONUS: optional(z.enum(["true", "false"])).transform((v) => v === "true"),
  NEXT_PUBLIC_APP_URL: optional(z.url()),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Variáveis de ambiente inválidas:\n${details.join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Só para testes: força a releitura do ambiente. */
export function resetServerEnvCache() {
  cached = undefined;
}

function required<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (value === undefined || value === null) {
    throw new Error(`A variável de ambiente ${key} é obrigatória. Veja o .env.example.`);
  }
  return value as NonNullable<ServerEnv[K]>;
}

export interface SupabaseServerConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
}

export function getSupabaseConfig(): SupabaseServerConfig {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    jwtSecret: required("SUPABASE_JWT_SECRET"),
  };
}

export const getHostPassword = () => required("HOST_PASSWORD");
export const getHostSessionSecret = () => required("HOST_SESSION_SECRET");
export const isMemoryBackend = () => getServerEnv().DATA_BACKEND === "memory";
export const isStreakBonusEnabled = () => getServerEnv().STREAK_BONUS;
