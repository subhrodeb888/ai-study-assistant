import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";

const createConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty.")
    .max(120, "Title is too long."),
});

export async function GET(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const conversations = await db
    .select({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt,
    })
    .from(chatSession)
    .where(eq(chatSession.userId, session.user.id))
    .orderBy(desc(chatSession.updatedAt));

  const sessionIds = conversations.map((conversation) => conversation.id);

  let messageCounts: Record<string, number> = {};

  if (sessionIds.length > 0) {
    const counts = await db
      .select({
        sessionId: chatMessage.sessionId,
        count: count(chatMessage.id),
      })
      .from(chatMessage)
      .where(inArray(chatMessage.sessionId, sessionIds))
      .groupBy(chatMessage.sessionId);

    messageCounts = Object.fromEntries(
      counts.map((entry) => [entry.sessionId, entry.count]),
    );
  }

  const result = conversations.map((conversation) => ({
    ...conversation,
    messageCount: messageCounts[conversation.id] ?? 0,
  }));

  return Response.json({ conversations: result });
}

export async function POST(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();

  const result = createConversationSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      { error: result.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const created = await db
    .insert(chatSession)
    .values({ userId: session.user.id, title: result.data.title })
    .returning({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt,
    });

  return Response.json({ conversation: created[0] }, { status: 201 });
}