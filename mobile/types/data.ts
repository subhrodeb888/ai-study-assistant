export type ChatRole = "user" | "assistant";

export type StudyDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  processed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
};

export type SummaryLength = "short" | "medium" | "detailed";

export type SummaryRecord = {
  id: string;
  sourceText: string;
  summary: string;
  length: SummaryLength;
  createdAt: string;
};

export type RetrievedChunk = {
  chunkId: string;
  chunkIndex: number;
  content: string;
  page: number | null;
  documentId: string;
  documentName: string;
  similarity: number;
};