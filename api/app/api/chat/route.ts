import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { openai } from "@/lib/openai";
import { createTextStreamResponse } from "@/lib/stream";
import { requireAuth } from "@/lib/require-auth";
import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";

const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(4000, "Message is too long."),

  sessionId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await requireAuth(request);

  if (!session) {
    return Response.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const body = await request.json();

    const result = chatRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: result.error.issues[0]?.message ?? "Invalid request.",
        },
        {
          status: 400,
        },
      );
    }

    const { message, sessionId } = result.data;

    const userId = session.user.id;

    // Find or create the conversation that owns this exchange.
    let conversationId: string;

    if (sessionId) {
      const conversation = await db
        .select({ id: chatSession.id })
        .from(chatSession)
        .where(
          and(
            eq(chatSession.id, sessionId),
            eq(chatSession.userId, userId),
          ),
        );

      if (conversation.length === 0) {
        return Response.json(
          {
            error: "Conversation not found.",
          },
          {
            status: 404,
          },
        );
      }

      conversationId = sessionId;
    } else {
      const title = message.length > 80 ? `${message.slice(0, 80)}…` : message;

      const created = await db
        .insert(chatSession)
        .values({ userId, title })
        .returning({ id: chatSession.id });

      conversationId = created[0].id;
    }

    // Persist the user message before calling the model.
    await db.insert(chatMessage).values({
      sessionId: conversationId,
      role: "user",
      content: message,
    });

    const stream = await openai.responses.create({
      model: "gpt-5-mini",

      instructions: `
You are an AI study assistant.

Your job is to help students understand concepts clearly.

Rules:
- Explain concepts accurately.
- Prefer clear and simple language.
- Use examples when they improve understanding.
- Do not unnecessarily overcomplicate answers.
- If the user asks for a technical explanation, use appropriate technical terminology.
        `.trim(),

      input: message,

      stream: true,
    });

    // Only persist the assistant message after generation succeeds.
    return createTextStreamResponse(stream, {
      headers: {
        "X-Conversation-Id": conversationId,
      },

      onComplete: async (fullText) => {
        await db.insert(chatMessage).values({
          sessionId: conversationId,
          role: "assistant",
          content: fullText,
        });

        await db
          .update(chatSession)
          .set({ updatedAt: new Date() })
          .where(eq(chatSession.id, conversationId));
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return Response.json(
      {
        error: "Something went wrong while generating the response.",
      },
      {
        status: 500,
      },
    );
  }
}
