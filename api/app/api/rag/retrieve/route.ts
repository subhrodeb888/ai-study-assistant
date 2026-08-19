import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import {
  retrieveRelevantChunks,
  RetrievalError,
  DEFAULT_TOP_K,
  MAX_TOP_K,
} from "@/lib/retrieve";

const retrieveRequestSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Query cannot be empty.")
    .max(2000, "Query is too long."),

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

  const result = retrieveRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const chunks = await retrieveRelevantChunks({
      userId: session.user.id,
      query: result.data.query,
      documentId: result.data.documentId,
      topK: result.data.topK ?? DEFAULT_TOP_K,
    });

    return Response.json({ chunks });
  } catch (error) {
    if (error instanceof RetrievalError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("Retrieval error:", error);

    return Response.json(
      { error: "Something went wrong while retrieving content." },
      { status: 500 },
    );
  }
}
