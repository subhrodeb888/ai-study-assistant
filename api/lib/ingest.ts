import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";

import { db } from "@/db";
import { documentChunk } from "@/db/schema";
import { openai } from "./openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = 1536;

export type DocumentInput = {
  id: string;
  mimeType: string;
  name: string;
};

export type ProcessedDocument = {
  documentId: string;
  chunkCount: number;
};

export class ProcessingError extends Error {}

// Chunking knobs.
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;
const MIN_READABLE_CHARS = 20;
const MAX_TOTAL_CHARS = 500_000;
const MAX_CHUNKS = 256;
const EMBEDDING_BATCH_SIZE = 16;

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitWithOverlap(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const chunks: string[] = [];

  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    if (end < text.length) {
      const slice = text.slice(start, end);

      const cutoff = Math.max(
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(" "),
      );

      // Only snap to a boundary if it keeps chunks reasonably sized.
      if (cutoff > CHUNK_SIZE * 0.5) {
        end = start + cutoff;
      }
    }

    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }

    start = end - CHUNK_OVERLAP;

    if (start < 0) {
      start = 0;
    }
  }

  return chunks;
}

async function extractPages(
  buffer: Buffer,
  mimeType: string,
): Promise<string[]> {
  if (mimeType === "text/plain") {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");

    return [text];
  }

  if (mimeType === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    const result = await extractText(pdf, { mergePages: false });

    return Array.isArray(result.text) ? result.text : [result.text];
  }

  throw new ProcessingError("Unsupported file type.");
}

async function embedInputs(inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    for (const entry of response.data) {
      vectors.push(entry.embedding);
    }
  }

  return vectors;
}

export async function processDocument(
  input: DocumentInput,
  buffer: Buffer,
): Promise<ProcessedDocument> {
  let pages: string[];

  try {
    pages = await extractPages(buffer, input.mimeType);
  } catch (error) {
    if (error instanceof ProcessingError) {
      throw error;
    }

    throw new ProcessingError("Failed to read document text.");
  }

  const cleanedPages = pages.map(cleanText);

  const totalChars = cleanedPages.reduce((sum, page) => sum + page.length, 0);

  if (totalChars < MIN_READABLE_CHARS) {
    throw new ProcessingError("The document contains no readable text.");
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    throw new ProcessingError("Document text is too large to process.");
  }

  const chunks: { content: string; page: number | null }[] = [];

  cleanedPages.forEach((pageText, index) => {
    const page = input.mimeType === "application/pdf" ? index + 1 : null;

    for (const content of splitWithOverlap(pageText)) {
      chunks.push({ content, page });
    }
  });

  if (chunks.length === 0) {
    throw new ProcessingError("No chunks could be generated.");
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new ProcessingError(
      "Document produces too many chunks; please split it into smaller files.",
    );
  }

  const inputs = chunks.map((chunk) => chunk.content);

  let vectors: number[][];

  try {
    vectors = await embedInputs(inputs);
  } catch (error) {
    console.error("Embedding generation error:", error);

    throw new ProcessingError("Failed to generate embeddings.");
  }

  // Store atomically and idempotently: any existing chunks for this document
  // are replaced, so reprocessing can never create duplicates. If embedding
  // fails (above), old data is left untouched.
  await db.transaction(async (tx) => {
    await tx
      .delete(documentChunk)
      .where(eq(documentChunk.documentId, input.id));

    if (vectors.length > 0) {
      await tx.insert(documentChunk).values(
        chunks.map((chunk, index) => ({
          documentId: input.id,
          content: chunk.content,
          chunkIndex: index,
          embedding: vectors[index],
          metadata: chunk.page !== null ? { page: chunk.page } : {},
        })),
      );
    }
  });

  return { documentId: input.id, chunkCount: vectors.length };
}

