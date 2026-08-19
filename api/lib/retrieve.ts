import { and, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { document as documentTable, documentChunk } from "@/db/schema";
import { openai } from "./openai";
import { EMBEDDING_DIMENSIONS } from "./ingest";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export const DEFAULT_TOP_K = 5;

export const MAX_TOP_K = 20;

export type RetrievedChunk = {
  chunkId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
  documentId: string;
  documentName: string;
  similarity: number;
};

export class RetrievalError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);

    this.name = "RetrievalError";

    this.status = status;
  }
}

export type RetrieveParams = {
  userId: string;
  query: string;
  documentId?: string;
  topK?: number;
};

export async function retrieveRelevantChunks({
  userId,
  query,
  documentId,
  topK = DEFAULT_TOP_K,
}: RetrieveParams): Promise<RetrievedChunk[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    throw new RetrievalError("Query cannot be empty.");
  }

  const limit = Math.min(Math.max(1, Math.floor(topK)), MAX_TOP_K);

  let allowedDocumentIds: string[];

  if (documentId) {
    const doc = await db
      .select({
        id: documentTable.id,
        chunkCount: count(documentChunk.id),
      })
      .from(documentTable)
      .leftJoin(
        documentChunk,
        eq(documentChunk.documentId, documentTable.id),
      )
      .where(
        and(
          eq(documentTable.id, documentId),
          eq(documentTable.userId, userId),
        ),
      )
      .groupBy(documentTable.id);

    if (doc.length === 0) {
      // 404 so a caller cannot tell whether a document exists but isn't theirs.
      throw new RetrievalError("Document not found.", 404);
    }

    if (Number(doc[0].chunkCount) === 0) {
      throw new RetrievalError(
        "Document has not been processed yet.",
        400,
      );
    }

    allowedDocumentIds = [doc[0].id];
  } else {
    allowedDocumentIds = await getUserProcessedDocumentIds(userId);

    if (allowedDocumentIds.length === 0) {
      return [];
    }
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const literal = `'[${response.data[0].embedding.join(",")}]'`;

  const distanceExpr = sql<number>`${documentChunk.embedding} <=> ${sql.raw(literal)}::vector`;

  const rows = await db
    .select({
      chunkId: documentChunk.id,
      chunkIndex: documentChunk.chunkIndex,
      content: documentChunk.content,
      metadata: documentChunk.metadata,
      documentId: documentChunk.documentId,
      documentName: documentTable.name,
      distance: distanceExpr,
    })
    .from(documentChunk)
    .innerJoin(
      documentTable,
      eq(documentChunk.documentId, documentTable.id),
    )
    .where(inArray(documentChunk.documentId, allowedDocumentIds))
    .orderBy(distanceExpr)
    .limit(limit);

  return rows.map((row) => ({
    chunkId: row.chunkId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    page: (row.metadata?.page as number | undefined) ?? null,
    documentId: row.documentId,
    documentName: row.documentName,
    similarity: Math.max(0, Math.min(1, 1 - row.distance)),
  }));
}

async function getUserProcessedDocumentIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: documentTable.id })
    .from(documentTable)
    .leftJoin(
      documentChunk,
      eq(documentChunk.documentId, documentTable.id),
    )
    .where(eq(documentTable.userId, userId))
    .groupBy(documentTable.id)
    .having(sql`count(${documentChunk.id}) > 0`);

  return rows.map((row) => row.id);
}
