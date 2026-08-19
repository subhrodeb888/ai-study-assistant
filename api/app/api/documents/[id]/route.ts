import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { document as documentTable } from "@/db/schema";
import { deleteDocumentFile } from "@/lib/storage";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = paramsSchema.parse(await context.params);

  const owned = await db
    .select({ id: documentTable.id })
    .from(documentTable)
    .where(and(eq(documentTable.id, id), eq(documentTable.userId, session.user.id)));

  if (owned.length === 0) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  await deleteDocumentFile(id);

  await db.delete(documentTable).where(eq(documentTable.id, id));

  return new Response(null, { status: 204 });
}
