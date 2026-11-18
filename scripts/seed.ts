/**
 * Valida content/quiz.json e grava no banco (função import_quiz, numa transação).
 *
 *   npm run seed                 valida e importa
 *   npm run seed -- --check      só valida (não precisa de banco)
 *   npm run seed -- outro.json   usa outro arquivo
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { formatQuizErrors, quizFileSchema } from "../lib/game/quiz-schema";

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? "content/quiz.json");

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Não foi possível ler ${file}: ${(error as Error).message}`);
  }

  const parsed = quizFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`✗ ${path.relative(process.cwd(), file)} é inválido:`);
    console.error(formatQuizErrors(parsed.error).join("\n"));
    process.exitCode = 1;
    return;
  }

  const quiz = parsed.data;
  console.log(`✓ "${quiz.title}" válido: ${quiz.questions.length} perguntas`);
  if (checkOnly) return;

  if (process.env.DATA_BACKEND === "memory") {
    console.log("DATA_BACKEND=memory: o app lê content/quiz.json direto, nada a gravar.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }

  const questions = [...quiz.questions].sort((a, b) => a.position - b.position);
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ title: quiz.title, questions }))
    .digest("hex");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("import_quiz", {
    p_title: quiz.title,
    p_content_hash: contentHash,
    p_questions: questions,
  });
  if (error) throw new Error(`Falha ao importar: ${error.message}`);
  console.log(`✓ Quiz gravado (id ${data as string})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
