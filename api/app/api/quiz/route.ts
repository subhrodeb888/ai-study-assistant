import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { quiz as quizTable, quizQuestion as quizQuestionTable } from "@/db/schema";

import { openai } from "@/lib/openai";

const quizQuestionSchema = z.object({
  question: z.string().describe("The quiz question."),

  options: z
    .array(z.string())
    .describe("Exactly four possible answer choices."),

  correctAnswer: z
    .number()
    .describe(
      "The zero-based index of the correct answer in the options array.",
    ),

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

const quizRequestSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "Topic must contain at least 2 characters.")
    .max(200, "Topic is too long."),

  difficulty: z.enum(["easy", "medium", "hard"]),

  questionCount: z.number().int().min(3).max(10),
});

export async function POST(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }
  try {
    const body = await request.json();

    const requestResult = quizRequestSchema.safeParse(body);

    if (!requestResult.success) {
      return Response.json(
        {
          error: requestResult.error.issues[0]?.message ?? "Invalid request.",
        },
        {
          status: 400,
        },
      );
    }

    const { topic, difficulty, questionCount } = requestResult.data;

    const response = await openai.responses.parse({
      model: "gpt-5-mini",

      instructions: `
You are an expert educational quiz generator.

Generate a multiple-choice quiz based on the
user's requested topic and difficulty.

Difficulty:
- easy: suitable for beginners.
- medium: requires understanding of the topic.
- hard: tests deeper knowledge and distinctions.

Rules:
- Generate exactly the requested number of questions.
- Every question must have exactly four options.
- There must be exactly one correct answer.
- correctAnswer must be the zero-based index of the correct option.
- The explanation must clearly explain the correct answer.
- Avoid ambiguous questions.
- Avoid trick questions unless they are appropriate for the requested difficulty.
- Do not include information unrelated to the requested topic.
        `.trim(),

      input: `
Create a ${difficulty} quiz about:

${topic}

Number of questions:
${questionCount}
        `.trim(),

      text: {
        format: zodTextFormat(quizSchema, "quiz"),
      },
    });

    if (!response.output_parsed) {
      return Response.json(
        {
          error: "The AI did not return a valid quiz.",
        },
        {
          status: 502,
        },
      );
    }

    const quiz = response.output_parsed;

    // Additional application-level validation.
    if (quiz.questions.length !== questionCount) {
      return Response.json(
        {
          error: "The AI returned an incorrect number of questions.",
        },
        {
          status: 502,
        },
      );
    }

    for (const question of quiz.questions) {
      if (question.options.length !== 4) {
        return Response.json(
          {
            error:
              "The AI returned a question with an invalid number of options.",
          },
          {
            status: 502,
          },
        );
      }

      if (
        question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length
      ) {
        return Response.json(
          {
            error: "The AI returned an invalid correct answer.",
          },
          {
            status: 502,
          },
        );
      }
    }

    // Persist the quiz and its questions atomically for the authenticated user.
    const createdQuiz = await db.transaction(async (tx) => {
      const [insertedQuiz] = await tx
        .insert(quizTable)
        .values({
          userId: session.user.id,
          title: quiz.title,
          topic,
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
    console.error("Quiz API error:", error);

    return Response.json(
      {
        error: "Something went wrong while generating the quiz.",
      },
      {
        status: 500,
      },
    );
  }
}
