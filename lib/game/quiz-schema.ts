import { z } from "zod";

const optionSchema = z.object({
  text: z.string().trim().min(1).max(120),
  correct: z.boolean(),
});

const questionSchema = z.object({
  position: z.int().min(1),
  text: z.string().trim().min(1).max(240),
  media: z
    .string()
    .trim()
    .regex(/^\/media\/[\w.-]+$/, "A mídia deve ficar em public/media (ex.: /media/q01.gif)")
    .nullish()
    .transform((v) => v ?? null),
  timeLimitSeconds: z.int().min(5).max(120).default(20),
  pointsMultiplier: z.int().min(1).max(3).default(1),
  options: z
    .array(optionSchema)
    .length(4, "Cada pergunta precisa de exatamente 4 alternativas")
    .refine(
      (options) => options.filter((o) => o.correct).length === 1,
      "Cada pergunta precisa de exatamente 1 alternativa correta",
    ),
});

/** Formato de `content/quiz.json`. */
export const quizFileSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((quiz, ctx) => {
    const positions = quiz.questions.map((q) => q.position).sort((a, b) => a - b);
    if (positions.some((position, index) => position !== index + 1)) {
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: `As posições devem ser 1..${positions.length} sem buracos nem repetições (encontrado: ${positions.join(", ")})`,
      });
    }
  });

export type QuizFile = z.infer<typeof quizFileSchema>;
export type QuizFileQuestion = QuizFile["questions"][number];

/** Formata os erros do Zod em linhas legíveis para o terminal. */
export function formatQuizErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => `- ${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
}
