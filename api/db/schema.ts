import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";

export const user = pgTable("user", {
  id: text("id").primaryKey(),

  name: text("name").notNull(),

  email: text("email").notNull().unique(),

  emailVerified: boolean("email_verified").default(false).notNull(),

  image: text("image"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),

  expiresAt: timestamp("expires_at").notNull(),

  token: text("token").notNull().unique(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  ipAddress: text("ip_address"),

  userAgent: text("user_agent"),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "cascade",
    }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),

  accountId: text("account_id").notNull(),

  providerId: text("provider_id").notNull(),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "cascade",
    }),

  accessToken: text("access_token"),

  refreshToken: text("refresh_token"),

  idToken: text("id_token"),

  accessTokenExpiresAt: timestamp("access_token_expires_at"),

  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),

  scope: text("scope"),

  password: text("password"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),

  identifier: text("identifier").notNull(),

  value: text("value").notNull(),

  expiresAt: timestamp("expires_at").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatSession = pgTable(
  "chat_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    title: text("title").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_sessions_user_id_idx").on(table.userId),
  ],
);

export const chatMessage = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSession.id, {
        onDelete: "cascade",
      }),

    role: text("role", { enum: ["user", "assistant"] }).notNull(),

    content: text("content").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_session_id_idx").on(table.sessionId),
  ],
);

export const summary = pgTable(
  "summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    sourceText: text("source_text").notNull(),

    summary: text("summary").notNull(),

    length: text("length", { enum: ["short", "medium", "detailed"] }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("summaries_user_id_idx").on(table.userId),
  ],
);

export const quiz = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    title: text("title").notNull(),

    topic: text("topic").notNull(),

    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),

    questionCount: integer("question_count").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("quizzes_user_id_idx").on(table.userId),
  ],
);

export const quizQuestion = pgTable(
  "quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id, {
        onDelete: "cascade",
      }),

    question: text("question").notNull(),

    options: jsonb("options").$type<string[]>().notNull(),

    correctAnswer: integer("correct_answer").notNull(),

    explanation: text("explanation").notNull(),

    questionOrder: integer("question_order").notNull(),
  },
  (table) => [
    index("quiz_questions_quiz_id_idx").on(table.quizId),
  ],
);

export const quizAttempt = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id, {
        onDelete: "cascade",
      }),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    score: integer("score").notNull(),

    totalQuestions: integer("total_questions").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("quiz_attempts_quiz_id_idx").on(table.quizId),
    index("quiz_attempts_user_id_idx").on(table.userId),
  ],
);

export const document = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    name: text("name").notNull(),

    mimeType: text("mime_type").notNull(),

    size: integer("size").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("documents_user_id_idx").on(table.userId),
  ],
);

export const documentChunk = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, {
        onDelete: "cascade",
      }),

    content: text("content").notNull(),

    chunkIndex: integer("chunk_index").notNull(),

    // 1536 dimensions = OpenAI text-embedding-3-small.
    embedding: vector("embedding", { dimensions: 1536 }),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("document_chunks_document_id_idx").on(table.documentId),
  ],
);
