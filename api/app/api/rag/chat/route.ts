import { z } from "zod";

import { openai } from "@/lib/openai";
import {
  createTextStreamResponse,
  createStringStreamResponse,
} from "@/lib/stream";
import { requireAuth } from "@/lib/require-auth";
import {
  retrieveRelevantChunks,
  RetrievalError,
  DEFAULT_TOP_K,
  MAX_TOP_K,
} from "@/lib/retrieve";
import {
  RAG_MODEL,
  RAG_SYSTEM_PROMPT,
  NO_CONTEXT_MESSAGE,
  buildRagContext,
  buildRagSources,
} from "@/lib/rag-chat";

const ragChatRequestSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Query cannot be empty.")
    .max(4000, "Query is too long."),

  documentId: z.string().uuid().optional(),

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

  const result = ragChatRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    // Retrieval is ownership-filtered inside retrieveRelevantChunks.
    const chunks = await retrieveRelevantChunks({
      userId: session.user.id,
      query: result.data.query,
      documentId: result.data.documentId,
      topK: result.data.topK ?? DEFAULT_TOP_K,
    });

    const sources = buildRagSources(chunks);

    const headers = {
      "X-RAG-Sources": JSON.stringify(sources),
    };

    if (chunks.length === 0) {
      return createStringStreamResponse(NO_CONTEXT_MESSAGE, headers);
    }

    const context = buildRagContext(chunks);

    const stream = await openai.responses.create({
      model: RAG_MODEL,

      instructions: `${RAG_SYSTEM_PROMPT}\n\nSTUDY MATERIAL:\n${context}`,

      input: result.data.query,

      stream: true,
    });

    return createTextStreamResponse(stream, { headers });
  } catch (error) {
    if (error instanceof RetrievalError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("RAG chat error:", error);

    return Response.json(
      { error: "Something went wrong while answering your question." },
      { status: 500 },
    );
  }
}
