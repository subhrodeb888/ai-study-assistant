import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { quiz as quizTable, quizAttempt } from "@/db/schema";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const attemptRequestSchema = z.object({
  score: z.number().int().min(0),
  totalQuestions: z.number().int().min(1).max(50),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = paramsSchema.parse(await context.params);

  // Verify the quiz belongs to the authenticated user before accepting.
  const owned = await db
    .select({ id: quizTable.id })
    .from(quizTable)
    .where(and(eq(quizTable.id, id), eq(quizTable.userId, session.user.id)));

  if (owned.length === 0) {
    return Response.json({ error: "Quiz not found." }, { status: 404 });
  }

  const body = await request.json();

  const result = attemptRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  if (result.data.score > result.data.totalQuestions) {
    return Response.json(
      { error: "Score cannot exceed total questions." },
      { status: 400 },
    );
  }

  const created = await db
    .insert(quizAttempt)
    .values({
      quizId: id,
      userId: session.user.id,
      score: result.data.score,
      totalQuestions: result.data.totalQuestions,
    })
    .returning({
      id: quizAttempt.id,
      quizId: quizAttempt.quizId,
      score: quizAttempt.score,
      totalQuestions: quizAttempt.totalQuestions,
      createdAt: quizAttempt.createdAt,
    });

  return Response.json({ attempt: created[0] }, { status: 201 });
}