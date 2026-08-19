import { z } from "zod";

import { openai } from "@/lib/openai";
import { createTextStreamResponse } from "@/lib/stream";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { summary } from "@/db/schema";

const summarizeRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "Please provide at least 20 characters of text.")
    .max(
      20000,
      "The text is too long. Please provide less than 20,000 characters.",
    ),

  length: z.enum(["short", "medium", "detailed"]),
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

    const result = summarizeRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: result.error.issues[0]?.message ?? "Invalid request.",
        },
        {
          status: 400,
        },
      );
    }

    const { text, length } = result.data;

    const userId = session.user.id;

    const lengthInstructions = {
      short:
        "Create a very concise summary containing only the most important points.",

      medium:
        "Create a balanced summary that covers the main ideas and important supporting details.",

      detailed:
        "Create a detailed summary that preserves important concepts, relationships, examples, and supporting details while remaining significantly shorter than the original text.",
    };

    const stream = await openai.responses.create({
      model: "gpt-5-mini",

      instructions: `
You are an AI study assistant that specializes in summarizing educational material.

Your task is to summarize the user's study material accurately.

Summary style:
${lengthInstructions[length]}

Rules:
- Preserve the original meaning.
- Do not invent facts.
- Do not introduce information that isn't present in the source.
- Organize the summary logically.
- Use clear language.
- Prefer short paragraphs and bullet points when they improve readability.
- Do not mention that you are an AI.
        `.trim(),

      input: `
Summarize the following study material:

--- BEGIN STUDY MATERIAL ---

${text}

--- END STUDY MATERIAL ---
        `.trim(),

      stream: true,
    });

    // Only persist the summary after generation succeeds.
    return createTextStreamResponse(stream, {
      onComplete: async (summaryText) => {
        await db.insert(summary).values({
          userId,
          sourceText: text,
          summary: summaryText,
          length,
        });
      },
    });
  } catch (error) {
    console.error("Summarize API error:", error);

    return Response.json(
      {
        error: "Something went wrong while generating the summary.",
      },
      {
        status: 500,
      },
    );
  }
}
