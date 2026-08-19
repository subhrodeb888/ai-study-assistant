import { z } from "zod";

import { openai } from "@/lib/openai";
import {
  createTextStreamResponse,
  createStringStreamResponse,
} from "@/lib/stream";
import { requireAuth } from "@/lib/require-auth";
import { RetrievalError, MAX_TOP_K } from "@/lib/retrieve";
import { db } from "@/db";
import { summary as summaryTable } from "@/db/schema";
import {
  buildGroundedMaterial,
  RAG_MODEL,
  RAG_SUMMARY_PROMPT,
  SUMMARY_INPUT,
  SUMMARY_RETRIEVAL_QUERY,
  NO_SUMMARY_MESSAGE,
} from "@/lib/rag-grounded";

const ragSummarizeRequestSchema = z.object({
  documentId: z.string().uuid(),

  topK: z.number().int().min(1).max(MAX_TOP_K).optional(),
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

  const result = ragSummarizeRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const material = await buildGroundedMaterial({
      userId: session.user.id,
      documentId: result.data.documentId,
      topK: result.data.topK ?? 10,
      query: SUMMARY_RETRIEVAL_QUERY,
    });

    if (material.chunks.length === 0) {
      return createStringStreamResponse(NO_SUMMARY_MESSAGE);
    }

    const stream = await openai.responses.create({
      model: RAG_MODEL,

      instructions: `${RAG_SUMMARY_PROMPT}\n\nSTUDY MATERIAL:\n${material.context}`,

      input: SUMMARY_INPUT,

      stream: true,
    });

    return createTextStreamResponse(stream, {
      onComplete: async (summaryText) => {
        await db.insert(summaryTable).values({
          userId: session.user.id,
          sourceText: material.context,
          summary: summaryText,
          length: "medium",
        });
      },
    });
  } catch (error) {
    if (error instanceof RetrievalError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("RAG summarize error:", error);

    return Response.json(
      { error: "Something went wrong while summarizing the material." },
      { status: 500 },
    );
  }
}
