import { del, list, put } from "@vercel/blob";

const DOCUMENT_PREFIX = "documents";

function getBlobPath(id: string): string {
  return `${DOCUMENT_PREFIX}/${id}`;
}

async function findDocumentBlob(id: string) {
  const pathname = getBlobPath(id);

  const result = await list({
    prefix: pathname,
    limit: 1,
  });

  return result.blobs.find((blob) => blob.pathname === pathname) ?? null;
}

export async function saveDocumentFile(
  id: string,
  buffer: Buffer,
): Promise<void> {
  await put(getBlobPath(id), buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/octet-stream",
    allowOverwrite: true,
  });
}

export async function deleteDocumentFile(id: string): Promise<void> {
  const blob = await findDocumentBlob(id);

  if (!blob) {
    return;
  }

  await del(blob.url);
}

export async function readDocumentFile(id: string): Promise<Buffer> {
  const blob = await findDocumentBlob(id);

  if (!blob) {
    throw new Error("Document blob not found.");
  }

  const response = await fetch(blob.url);

  if (!response.ok) {
    throw new Error(
      `Failed to read document blob: ${response.status} ${response.statusText}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
