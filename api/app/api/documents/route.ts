import { count, desc, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { document as documentTable, documentChunk } from "@/db/schema";
import { saveDocumentFile } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_MIME_TYPES = new Set(["application/pdf", "text/plain"]);

function basename(value: string): string {
  const parts = value.split(/[\\/]+/);

  return parts[parts.length - 1] ?? value;
}

export async function GET(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const documents = await db
    .select({
      id: documentTable.id,
      name: documentTable.name,
      mimeType: documentTable.mimeType,
      size: documentTable.size,
      createdAt: documentTable.createdAt,
      updatedAt: documentTable.updatedAt,
    })
    .from(documentTable)
    .where(eq(documentTable.userId, session.user.id))
    .orderBy(desc(documentTable.createdAt));

  const documentIds = documents.map((document) => document.id);

  const processedIds = new Set<string>();

  if (documentIds.length > 0) {
    const counts = await db
      .select({
        documentId: documentChunk.documentId,
        count: count(documentChunk.id),
      })
      .from(documentChunk)
      .where(inArray(documentChunk.documentId, documentIds))
      .groupBy(documentChunk.documentId);

    for (const entry of counts) {
      if (entry.count > 0) {
        processedIds.add(entry.documentId);
      }
    }
  }

  const result = documents.map((document) => ({
    ...document,
    processed: processedIds.has(document.id),
  }));

  return Response.json({ documents: result });
}

export async function POST(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart/form-data request." },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "A file field is required." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return Response.json({ error: "The file is empty." }, { status: 400 });
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return Response.json(
      { error: "File must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: "Only PDF and TXT files are supported." },
      { status: 400 },
    );
  }

  const name = basename(file.name || "document");

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const created = await db
      .insert(documentTable)
      .values({
        userId: session.user.id,
        name,
        mimeType: file.type,
        size: file.size,
      })
      .returning({
        id: documentTable.id,
        name: documentTable.name,
        mimeType: documentTable.mimeType,
        size: documentTable.size,
        createdAt: documentTable.createdAt,
        updatedAt: documentTable.updatedAt,
      });

    try {
      await saveDocumentFile(created[0].id, buffer);
    } catch (error) {
      console.error("Failed to store document file:", error);

      await db
        .delete(documentTable)
        .where(eq(documentTable.id, created[0].id));

      return Response.json(
        { error: "Failed to store the uploaded file." },
        { status: 500 },
      );
    }

    return Response.json({ document: created[0] }, { status: 201 });
  } catch (error) {
    console.error("Document upload error:", error);

    return Response.json(
      { error: "Something went wrong while uploading the document." },
      { status: 500 },
    );
  }
}
