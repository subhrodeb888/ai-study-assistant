import { desc, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { summary } from "@/db/schema";

export async function GET(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summaries = await db
    .select({
      id: summary.id,
      sourceText: summary.sourceText,
      summary: summary.summary,
      length: summary.length,
      createdAt: summary.createdAt,
    })
    .from(summary)
    .where(eq(summary.userId, session.user.id))
    .orderBy(desc(summary.createdAt));

  return Response.json({ summaries });
}