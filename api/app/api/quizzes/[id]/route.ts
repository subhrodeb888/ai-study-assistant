import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { quiz as quizTable, quizQuestion } from "@/db/schema";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = paramsSchema.parse(await context.params);

  // Ownership is enforced here — a user can only read their own quiz.
  const quizzes = await db
    .select({
      id: quizTable.id,
      title: quizTable.title,
      topic: quizTable.topic,
      difficulty: quizTable.difficulty,
      questionCount: quizTable.questionCount,
      createdAt: quizTable.createdAt,
    })
    .from(quizTable)
    .where(and(eq(quizTable.id, id), eq(quizTable.userId, session.user.id)));

  if (quizzes.length === 0) {
    return Response.json({ error: "Quiz not found." }, { status: 404 });
  }

  const storedQuiz = quizzes[0];

  const questions = await db
    .select({
      id: quizQuestion.id,
      question: quizQuestion.question,
      options: quizQuestion.options,
      correctAnswer: quizQuestion.correctAnswer,
      explanation: quizQuestion.explanation,
      questionOrder: quizQuestion.questionOrder,
    })
    .from(quizQuestion)
    .where(eq(quizQuestion.quizId, storedQuiz.id))
    .orderBy(asc(quizQuestion.questionOrder));

  return Response.json({
    quiz: {
      ...storedQuiz,
      questions: questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      })),
    },
  });
}