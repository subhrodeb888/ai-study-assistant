import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = paramsSchema.parse(await context.params);

  const conversations = await db
    .select({
      id: chatSession.id,
      userId: chatSession.userId,
      title: chatSession.title,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt,
    })
    .from(chatSession)
    .where(eq(chatSession.id, id));

  if (conversations.length === 0) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const conversation = conversations[0];

  if (conversation.userId !== session.user.id) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const messages = await db
    .select({
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.content,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(eq(chatMessage.sessionId, conversation.id))
    .orderBy(asc(chatMessage.createdAt));

  return Response.json({
    conversation,
    messages,
  });
}

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
    .select({ id: chatSession.id })
    .from(chatSession)
    .where(and(eq(chatSession.id, id), eq(chatSession.userId, session.user.id)));

  if (owned.length === 0) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  await db.delete(chatSession).where(eq(chatSession.id, id));

  return new Response(null, { status: 204 });
}