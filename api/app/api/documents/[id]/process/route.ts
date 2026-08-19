import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { document as documentTable } from "@/db/schema";
import { readDocumentFile } from "@/lib/storage";
import { processDocument, ProcessingError } from "@/lib/ingest";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
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

  // Ownership enforced here: only the document's owner can process it.
  const owned = await db
    .select({
      id: documentTable.id,
      name: documentTable.name,
      mimeType: documentTable.mimeType,
    })
    .from(documentTable)
    .where(and(eq(documentTable.id, id), eq(documentTable.userId, session.user.id)));

  if (owned.length === 0) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const document = owned[0];

  let buffer: Buffer;

  try {
    buffer = await readDocumentFile(document.id);
  } catch {
    return Response.json(
      { error: "Stored file is missing." },
      { status: 404 },
    );
  }

  try {
    const result = await processDocument(document, buffer);

    return Response.json({
      processed: true,
      documentId: result.documentId,
      chunkCount: result.chunkCount,
    });
  } catch (error) {
    if (error instanceof ProcessingError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("Document processing error:", error);

    return Response.json(
      { error: "Something went wrong while processing the document." },
      { status: 500 },
    );
  }
}
