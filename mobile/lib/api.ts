import { fetch } from "expo/fetch";
import { File } from "expo-file-system";

import { authClient } from "./auth-client";

import type { Quiz, QuizAttempt, QuizDifficulty } from "../types/quiz";
import type {
  ChatMessage,
  Conversation,
  ConversationDetail,
  RetrievedChunk,
  StudyDocument,
  SummaryRecord,
} from "../types/data";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is not configured.");
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookie = authClient.getCookie();

  if (!cookie) {
    throw new Error("You must be signed in.");
  }

  return {
    Cookie: cookie,
  };
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.json();

    if (data?.error) {
      return data.error;
    }
  } catch {
    // Ignore JSON parsing errors.
  }

  return fallback;
}

export async function streamChatMessage(
  message: string,
  onChunk: (chunk: string) => void,
  sessionId?: string | null,
): Promise<string> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "text/plain",
    },

    body: JSON.stringify({
      message,
      sessionId: sessionId ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readError(response, "Failed to generate AI response."),
    );
  }

  const conversationId =
    response.headers.get("x-conversation-id") ?? sessionId ?? "";

  if (!response.body) {
    throw new Error("The server did not return a readable stream.");
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, {
        stream: true,
      });

      if (chunk) {
        onChunk(chunk);
      }
    }

    const finalChunk = decoder.decode();

    if (finalChunk) {
      onChunk(finalChunk);
    }
  } finally {
    reader.releaseLock();
  }

  return conversationId;
}

export async function getConversations(): Promise<Conversation[]> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/conversations`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load conversations."));
  }

  const data = (await response.json()) as { conversations?: Conversation[] };

  return data.conversations ?? [];
}

export async function createConversation(title: string): Promise<Conversation> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/conversations`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(
      await readError(response, "Failed to create conversation."),
    );
  }

  const data = (await response.json()) as { conversation?: Conversation };

  if (!data.conversation) {
    throw new Error("The server returned an empty conversation.");
  }

  return data.conversation;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/conversations/${id}`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load conversation."));
  }

  return (await response.json()) as ConversationDetail;
}

export async function deleteConversation(id: string): Promise<void> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/conversations/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(
      await readError(response, "Failed to delete conversation."),
    );
  }
}

export async function getChatMessages(id: string): Promise<ChatMessage[]> {
  const detail = await getConversation(id);

  return detail.messages;
}

export async function streamSummary(
  text: string,
  length: "short" | "medium" | "detailed",
  onChunk: (chunk: string) => void,
): Promise<void> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/summarize`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "text/plain",
    },

    body: JSON.stringify({
      text,
      length,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to generate summary.";

    try {
      const data = await response.json();

      if (data?.error) {
        errorMessage = data.error;
      }
    } catch {
      // Ignore JSON parsing errors.
    }

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("The server did not return a readable stream.");
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, {
        stream: true,
      });

      if (chunk) {
        onChunk(chunk);
      }
    }

    const finalChunk = decoder.decode();

    if (finalChunk) {
      onChunk(finalChunk);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getSummaries(): Promise<SummaryRecord[]> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/summaries`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load summaries."));
  }

  const data = (await response.json()) as { summaries?: SummaryRecord[] };

  return data.summaries ?? [];
}

export async function generateQuiz(
  topic: string,
  difficulty: QuizDifficulty,
  questionCount: number,
): Promise<Quiz> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/quiz`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      topic,
      difficulty,
      questionCount,
    }),
  });

  let data: {
    quiz?: Quiz;
    error?: string;
  };

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to generate quiz.");
  }

  if (!data.quiz) {
    throw new Error("The server returned an empty quiz.");
  }

  return data.quiz;
}

export async function getQuizzes(): Promise<Quiz[]> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/quizzes`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load quizzes."));
  }

  const data = (await response.json()) as { quizzes?: Quiz[] };

  return data.quizzes ?? [];
}

export async function getQuiz(id: string): Promise<Quiz> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/quizzes/${id}`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load quiz."));
  }

  const data = (await response.json()) as { quiz?: Quiz };

  if (!data.quiz) {
    throw new Error("The server returned an empty quiz.");
  }

  return data.quiz;
}

export async function submitQuizAttempt(
  quizId: string,
  score: number,
  totalQuestions: number,
): Promise<QuizAttempt> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/quizzes/${quizId}/attempts`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      score,
      totalQuestions,
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to save quiz attempt."));
  }

  const data = (await response.json()) as { attempt?: QuizAttempt };

  if (!data.attempt) {
    throw new Error("The server returned an empty attempt.");
  }

  return data.attempt;
}

export type UploadFilePart = {
  uri: string;
  name: string;
  type: string;
};

export async function getDocuments(): Promise<StudyDocument[]> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/documents`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load documents."));
  }

  const data = (await response.json()) as { documents?: StudyDocument[] };

  return data.documents ?? [];
}

export async function uploadDocument(
  file: UploadFilePart,
): Promise<StudyDocument> {
  const cookie = authClient.getCookie();

  if (!cookie) {
    throw new Error("You must be signed in.");
  }

  const formData = new FormData();

  const expoFile = new File(file.uri);

  formData.append("file", expoFile);

  const response = await fetch(`${API_URL}/api/documents`, {
    method: "POST",
    headers: {
      Cookie: cookie,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to upload document."));
  }

  const data = (await response.json()) as {
    document?: StudyDocument;
  };

  if (!data.document) {
    throw new Error("The server returned an empty document.");
  }

  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to delete document."));
  }
}

export async function processDocument(
  id: string,
): Promise<{ documentId: string; chunkCount: number }> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/documents/${id}/process`, {
    method: "POST",
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to process document."));
  }

  const data = (await response.json()) as {
    processed?: boolean;
    documentId?: string;
    chunkCount?: number;
  };

  return {
    documentId: data.documentId ?? id,
    chunkCount: data.chunkCount ?? 0,
  };
}

export async function retrieveRelevantChunks(
  query: string,
  documentId?: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/rag/retrieve`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({ query, documentId, topK }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to retrieve chunks."));
  }

  const data = (await response.json()) as { chunks?: RetrievedChunk[] };

  return data.chunks ?? [];
}

export async function streamRagChatMessage(
  query: string,
  onChunk: (chunk: string) => void,
  documentId?: string,
  topK = 5,
): Promise<RetrievedChunk[] | null> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/rag/chat`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "text/plain",
    },

    body: JSON.stringify({ query, documentId, topK }),
  });

  if (!response.ok) {
    throw new Error(
      await readError(response, "Failed to get a grounded answer."),
    );
  }

  let sources: RetrievedChunk[] | null = null;

  const rawSources = response.headers.get("x-rag-sources");

  if (rawSources) {
    try {
      sources = JSON.parse(rawSources) as RetrievedChunk[];
    } catch {
      sources = null;
    }
  }

  if (!response.body) {
    throw new Error("The server did not return a readable stream.");
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });

      if (chunk) {
        onChunk(chunk);
      }
    }

    const finalChunk = decoder.decode();

    if (finalChunk) {
      onChunk(finalChunk);
    }
  } finally {
    reader.releaseLock();
  }

  return sources;
}

export async function streamRagSummary(
  documentId: string,
  onChunk: (chunk: string) => void,
  topK = 10,
): Promise<void> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/rag/summarize`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "text/plain",
    },

    body: JSON.stringify({ documentId, topK }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to summarize material."));
  }

  if (!response.body) {
    throw new Error("The server did not return a readable stream.");
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });

      if (chunk) {
        onChunk(chunk);
      }
    }

    const finalChunk = decoder.decode();

    if (finalChunk) {
      onChunk(finalChunk);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function generateRagQuiz(
  documentId: string,
  questionCount: number,
  difficulty: QuizDifficulty,
): Promise<Quiz> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/rag/quiz`, {
    method: "POST",

    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({ documentId, questionCount, difficulty }),
  });

  const data = (await response.json()) as { quiz?: Quiz; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to generate quiz from material.");
  }

  if (!data.quiz) {
    throw new Error("The server returned an empty quiz.");
  }

  return data.quiz;
}
