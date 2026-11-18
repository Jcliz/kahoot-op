/**
 * Roda as migrations num Postgres embutido (PGlite) para conferir a sintaxe,
 * as restrições, a view de placar e a função import_quiz.
 * Os objetos que o Supabase já traz prontos (papéis, auth.jwt, realtime) são simulados.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import quizJson from "../content/quiz.json";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text, extension text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select ''::text $$;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function importQuiz(hash: string, questions: unknown = quizJson.questions) {
  const result = await db.query<{ id: string }>(
    "select public.import_quiz($1, $2, $3::jsonb) as id",
    [quizJson.title, hash, JSON.stringify(questions)],
  );
  return result.rows[0].id;
}

describe("migrations", () => {
  it("import_quiz grava perguntas e alternativas na ordem", async () => {
    const quizId = await importQuiz("hash-1");
    const { rows } = await db.query<{ position: number; options: number; correct: number }>(
      `select q.position, count(o.id)::int as options, count(*) filter (where o.is_correct)::int as correct
       from question q join option o on o.question_id = q.id
       where q.quiz_id = $1 group by q.position order by q.position`,
      [quizId],
    );
    expect(rows).toHaveLength(quizJson.questions.length);
    expect(rows.every((r) => r.options === 4 && r.correct === 1)).toBe(true);
  });

  it("import_quiz não duplica conteúdo idêntico", async () => {
    const first = await importQuiz("hash-2");
    const again = await importQuiz("hash-2");
    expect(again).toBe(first);
  });

  it("import_quiz recusa pergunta com duas corretas e desfaz tudo", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from quiz");
    const bad = [
      {
        ...quizJson.questions[0],
        options: quizJson.questions[0].options.map((o) => ({ ...o, correct: true })),
      },
    ];
    await expect(importQuiz("hash-bad", bad)).rejects.toThrow(/exatamente 1/);
    const after = await db.query<{ n: number }>("select count(*)::int as n from quiz");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("garante PIN único só entre sessões ativas e uma resposta por pergunta", async () => {
    const quizId = await importQuiz("hash-3");
    const insertSession = (status: string) =>
      db.query<{ id: string }>(
        "insert into session (quiz_id, pin, status) values ($1, '482913', $2) returning id",
        [quizId, status],
      );
    await insertSession("FINISHED");
    const { rows } = await insertSession("LOBBY");
    await expect(insertSession("LOBBY")).rejects.toThrow(/session_active_pin/);

    const sessionId = rows[0].id;
    const player = await db.query<{ id: string }>(
      "insert into player (session_id, nickname, nickname_key, token_hash) values ($1, 'Zé', 'ze', 'h1') returning id",
      [sessionId],
    );
    await expect(
      db.query(
        "insert into player (session_id, nickname, nickname_key, token_hash) values ($1, 'ZE', 'ze', 'h2')",
        [sessionId],
      ),
    ).rejects.toThrow(/duplicate key/);

    const option = await db.query<{ id: string; question_id: string }>(
      `select o.id, o.question_id from option o join question q on q.id = o.question_id
       where q.quiz_id = $1 and q.position = 1 and o.is_correct`,
      [quizId],
    );
    const answer = [sessionId, option.rows[0].question_id, player.rows[0].id, option.rows[0].id];
    const insertAnswer = () =>
      db.query(
        `insert into answer (session_id, question_id, player_id, option_id, is_correct, response_ms, points)
         values ($1, $2, $3, $4, true, 1500, 963)`,
        answer,
      );
    await insertAnswer();
    await expect(insertAnswer()).rejects.toThrow(/duplicate key/);

    const standing = await db.query(
      "select score, correct_count, correct_ms from player_standing where player_id = $1",
      [player.rows[0].id],
    );
    expect(standing.rows[0]).toEqual({ score: 963, correct_count: 1, correct_ms: 1500 });
  });
});
