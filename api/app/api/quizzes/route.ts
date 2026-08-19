import { desc, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { quiz } from "@/db/schema";

export async function GET(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const quizzes = await db
    .select({
      id: quiz.id,
      title: quiz.title,
      topic: quiz.topic,
      difficulty: quiz.difficulty,
      questionCount: quiz.questionCount,
      createdAt: quiz.createdAt,
    })
    .from(quiz)
    .where(eq(quiz.userId, session.user.id))
    .orderBy(desc(quiz.createdAt));

  return Response.json({ quizzes });
}