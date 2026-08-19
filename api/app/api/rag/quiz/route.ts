import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import { requireAuth } from "@/lib/require-auth";
import { RetrievalError } from "@/lib/retrieve";
import { db } from "@/db";
import { quiz as quizTable, quizQuestion as quizQuestionTable } from "@/db/schema";
import { openai } from "@/lib/openai";
import {
  buildGroundedMaterial,
  RAG_MODEL,
  RAG_QUIZ_PROMPT,
  QUIZ_RETRIEVAL_QUERY,
} from "@/lib/rag-grounded";

const quizQuestionSchema = z.object({
  question: z.string().describe("The quiz question."),

  options: z
    .array(z.string())
    .describe("Exactly four possible answer choices."),

  correctAnswer: z
    .number()
    .describe("The zero-based index of the correct answer in the options array."),

  explanation: z
    .string()
    .describe("A concise explanation of why the correct answer is correct."),
});

const quizSchema = z.object({
  title: z.string().describe("A short title for the quiz."),

  questions: z
    .array(quizQuestionSchema)
    .describe("The generated multiple-choice questions."),
});

const ragQuizRequestSchema = z.object({
  documentId: z.string().uuid(),

  questionCount: z.number().int().min(3).max(10),

  difficulty: z.enum(["easy", "medium", "hard"]),
});

export async function POST(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = ragQuizRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { documentId, questionCount, difficulty } = result.data;

  try {
    const material = await buildGroundedMaterial({
      userId: session.user.id,
      documentId,
      topK: 20,
      query: QUIZ_RETRIEVAL_QUERY,
    });

    if (material.chunks.length === 0) {
      return Response.json(
        { error: "The study material contains no content to base a quiz on." },
        { status: 400 },
      );
    }

    const response = await openai.responses.parse({
      model: RAG_MODEL,

      instructions: `${RAG_QUIZ_PROMPT}

Difficulty:
- easy: suitable for beginners.
- medium: requires understanding of the topic.
- hard: tests deeper knowledge and distinctions.

STUDY MATERIAL:
${material.context}

Generate exactly ${questionCount} ${difficulty} questions using only the study material above.`,

      input: "Create the multiple-choice quiz from the study material.",

      text: {
        format: zodTextFormat(quizSchema, "quiz"),
      },
    });

    if (!response.output_parsed) {
      return Response.json(
        { error: "The AI did not return a valid quiz." },
        { status: 502 },
      );
    }

    const quiz = response.output_parsed;

    if (quiz.questions.length !== questionCount) {
      return Response.json(
        { error: "The AI returned an incorrect number of questions." },
        { status: 502 },
      );
    }

    for (const question of quiz.questions) {
      if (question.options.length !== 4) {
        return Response.json(
          { error: "The AI returned a question with an invalid number of options." },
          { status: 502 },
        );
      }

      if (
        question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length
      ) {
        return Response.json(
          { error: "The AI returned an invalid correct answer." },
          { status: 502 },
        );
      }
    }

    const createdQuiz = await db.transaction(async (tx) => {
      const [insertedQuiz] = await tx
        .insert(quizTable)
        .values({
          userId: session.user.id,
          title: quiz.title,
          topic: result.data.documentId,
          difficulty,
          questionCount,
        })
        .returning();

      if (quiz.questions.length > 0) {
        await tx.insert(quizQuestionTable).values(
          quiz.questions.map((question, index) => ({
            quizId: insertedQuiz.id,
            question: question.question,
            options: question.options,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            questionOrder: index,
          })),
        );
      }

      return insertedQuiz;
    });

    return Response.json({
      quiz: {
        id: createdQuiz.id,
        title: createdQuiz.title,
        topic: createdQuiz.topic,
        difficulty: createdQuiz.difficulty,
        questionCount: createdQuiz.questionCount,
        createdAt: createdQuiz.createdAt,
        questions: quiz.questions.map((question) => ({ ...question })),
      },
    });
  } catch (error) {
    if (error instanceof RetrievalError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("RAG quiz error:", error);

    return Response.json(
      { error: "Something went wrong while generating the quiz." },
      { status: 500 },
    );
  }
}
