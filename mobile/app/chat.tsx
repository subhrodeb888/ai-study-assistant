import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { colors } from "../constants/colors";
import {
  deleteConversation,
  getConversation,
  getConversations,
  streamChatMessage,
  streamRagChatMessage,
} from "../lib/api";
import { formatDate } from "../lib/format";
import type { Conversation, RetrievedChunk } from "../types/data";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RetrievedChunk[];
};

type ViewMode = "list" | "chat";

export default function ChatScreen() {
  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [mode, setMode] = useState<ViewMode>("list");

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [historyLoading, setHistoryLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [openingId, setOpeningId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollViewRef = useRef<ScrollView>(null);

  const conversationIdRef = useRef<string | null>(null);

  const params = useLocalSearchParams<{
    documentId?: string;
    title?: string;
  }>();

  const [rag, setRag] = useState<{
    documentId: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({
      animated: true,
    });
  }, [messages]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
      },
    );

    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function loadConversations(refresh = false) {
    if (refresh) {
      setRefreshing(true);
    } else if (conversations.length === 0) {
      setHistoryLoading(true);
    }

    try {
      const result = await getConversations();

      setConversations(result);
      setHistoryError("");
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load conversations.",
      );
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadConversations();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const documentId =
      typeof params.documentId === "string" && params.documentId.length > 0
        ? params.documentId
        : null;

    if (documentId) {
      setRag({
        documentId,
        title:
          typeof params.title === "string" && params.title.length > 0
            ? params.title
            : "this study material",
      });

      setMessages([]);
      setError("");
      conversationIdRef.current = null;
      setMode("chat");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.documentId, params.title]);

  function goToHistory() {
    setMode("list");
    loadConversations();
  }

  function handleStartNewChat() {
    setMessages([]);
    setError("");
    conversationIdRef.current = null;
    setMode("chat");
  }

  async function openConversation(conversation: Conversation) {
    setOpeningId(conversation.id);
    setError("");

    try {
      const detail = await getConversation(conversation.id);

      setMessages(detail.messages);
      conversationIdRef.current = conversation.id;
      setMode("chat");
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to open conversation.",
      );
    } finally {
      setOpeningId(null);
    }
  }

  function confirmDelete(conversation: Conversation) {
    Alert.alert(
      "Delete conversation?",
      `"${conversation.title}" and all its messages will be removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(conversation),
        },
      ],
    );
  }

  async function handleDelete(conversation: Conversation) {
    setDeletingId(conversation.id);

    try {
      await deleteConversation(conversation.id);

      setConversations((current) =>
        current.filter((item) => item.id !== conversation.id),
      );

      if (conversationIdRef.current === conversation.id) {
        conversationIdRef.current = null;
      }
    } catch (deleteError) {
      setHistoryError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete conversation.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSend() {
    const submittedMessage = message.trim();

    if (!submittedMessage || loading) {
      return;
    }

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      content: submittedMessage,
    };

    const assistantMessageId = `${Date.now()}-assistant`;

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ]);

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const appendToAssistant = (chunk: string) => {
        setMessages((currentMessages) =>
          currentMessages.map((currentMessage) => {
            if (currentMessage.id !== assistantMessageId) {
              return currentMessage;
            }

            return {
              ...currentMessage,
              content: currentMessage.content + chunk,
            };
          }),
        );
      };

      if (rag) {
        const sources = await streamRagChatMessage(
          submittedMessage,
          appendToAssistant,
          rag.documentId,
        );

        if (sources && sources.length > 0) {
          setMessages((currentMessages) =>
            currentMessages.map((currentMessage) =>
              currentMessage.id === assistantMessageId
                ? {
                    ...currentMessage,
                    sources,
                  }
                : currentMessage,
            ),
          );
        }
      } else {
        const conversationId = await streamChatMessage(
          submittedMessage,
          appendToAssistant,
          conversationIdRef.current,
        );

        conversationIdRef.current = conversationId;
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Something went wrong.",
      );

      setMessages((currentMessages) =>
        currentMessages.filter(
          (currentMessage) => currentMessage.id !== assistantMessageId,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  if (mode === "list") {
    return (
      <Screen>
        <Header title="Ask AI" subtitle="Your conversation history" showBack />

        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadConversations(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <Pressable
              onPress={handleStartNewChat}
              style={({ pressed }) => [
                styles.newChatButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.newChatButtonText}>＋ New Chat</Text>
            </Pressable>
          }
          ListEmptyComponent={
            historyLoading ? (
              <View style={styles.listState}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : historyError ? (
              <View style={styles.listState}>
                <Text style={styles.emptyTitle}>Couldn't load history</Text>

                <Text style={styles.emptyDescription}>{historyError}</Text>

                <Pressable
                  onPress={() => loadConversations()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.listState}>
                <Text style={styles.emoji}>💬</Text>

                <Text style={styles.emptyTitle}>No conversations yet</Text>

                <Text style={styles.emptyDescription}>
                  Ask AI a question to start one.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.conversationRow}>
              <Pressable
                onPress={() => openConversation(item)}
                disabled={openingId !== null}
                style={({ pressed }) => [
                  styles.conversationMain,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.conversationInfo}>
                  <Text style={styles.conversationTitle} numberOfLines={1}>
                    {item.title}
                  </Text>

                  <Text style={styles.conversationMeta}>
                    {formatDate(item.updatedAt)}
                    {typeof item.messageCount === "number"
                      ? ` · ${item.messageCount} messages`
                      : ""}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => confirmDelete(item)}
                disabled={deletingId !== null}
                hitSlop={8}
                style={styles.deleteButton}
              >
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.deleteText}>Delete</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      </Screen>
    );
  }

  const chatContent = (
    <>
      <Header
        title="Ask AI"
        subtitle="Ask anything and learn something new."
        showBack
        onBack={goToHistory}
      />

      {rag && (
        <View style={styles.ragBanner}>
          <View style={styles.ragBannerInfo}>
            <Text style={styles.ragBannerLabel}>⚡ Study material</Text>

            <Text style={styles.ragBannerTitle} numberOfLines={1}>
              {rag.title}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setRag(null);
              setMessages([]);
            }}
            hitSlop={8}
          >
            <Text style={styles.ragBannerEnd}>End</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.messages}
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 && styles.emptyMessagesContent,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emoji}>💬</Text>

            <Text style={styles.emptyTitle}>Your AI tutor</Text>

            <Text style={styles.emptyDescription}>
              Ask a question and get a clear explanation tailored to your
              learning level.
            </Text>
          </View>
        ) : (
          messages.map((item) => {
            if (item.role === "user") {
              return (
                <View key={item.id} style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{item.content}</Text>
                  </View>
                </View>
              );
            }

            return (
              <View key={item.id} style={styles.aiRow}>
                <View style={styles.aiBubble}>
                  <Text style={styles.aiLabel}>AI</Text>

                  {item.content ? (
                    <Text style={styles.aiText}>{item.content}</Text>
                  ) : loading ? (
                    <View style={styles.thinkingContainer}>
                      <ActivityIndicator size="small" color={colors.primary} />

                      <Text style={styles.thinkingText}>Thinking...</Text>
                    </View>
                  ) : null}
                </View>

                {item.sources && item.sources.length > 0 && (
                  <View style={styles.sourcesContainer}>
                    <Text style={styles.sourcesTitle}>Sources</Text>

                    {item.sources.map((source, sourceIndex) => (
                      <View
                        key={`${source.chunkId}-${sourceIndex}`}
                        style={styles.sourceRow}
                      >
                        <Text style={styles.sourceName} numberOfLines={1}>
                          📄 {source.documentName}
                        </Text>

                        <Text style={styles.sourceMeta}>
                          {source.page != null ? `Page ${source.page} · ` : ""}
                          {Math.round(source.similarity * 100)}% similar
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.inputContainer,
          Platform.OS === "android" &&
            keyboardHeight > 0 && {
              paddingBottom: keyboardHeight + 12,
            },
        ]}
      >
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Ask anything..."
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={4000}
          editable={!loading}
          style={styles.input}
          textAlignVertical="top"
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          disableFullscreenUI={true}
          autoCorrect={true}
          autoCapitalize="sentences"
        />

        <Pressable
          onPress={handleSend}
          disabled={!message.trim() || loading}
          style={({ pressed }) => [
            styles.sendButton,
            (!message.trim() || loading) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  return (
    <Screen>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={styles.container} behavior="padding">
          {chatContent}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>{chatContent}</View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },

  listState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 80,
  },

  newChatButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginBottom: 20,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },

  newChatButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },

  conversationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },

  conversationMain: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },

  rowPressed: {
    opacity: 0.7,
    backgroundColor: colors.surface,
  },

  conversationInfo: {
    flex: 1,
  },

  conversationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },

  conversationMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
  },

  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    alignSelf: "stretch",
  },

  deleteText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
  },

  buttonPressed: {
    opacity: 0.8,
  },

  retryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },

  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },

  messages: {
    flex: 1,
    paddingHorizontal: 24,
  },

  messagesContent: {
    paddingTop: 10,
    paddingBottom: 20,
  },

  emptyMessagesContent: {
    flexGrow: 1,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  emoji: {
    fontSize: 48,
    marginBottom: 20,
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },

  emptyDescription: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },

  userRow: {
    alignItems: "flex-end",
    marginBottom: 14,
  },

  userBubble: {
    maxWidth: "85%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },

  userText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.white,
  },

  aiRow: {
    alignItems: "flex-start",
    marginBottom: 18,
  },

  aiBubble: {
    maxWidth: "92%",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },

  aiLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  aiText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },

  thinkingContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 24,
  },

  thinkingText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.textSecondary,
  },

  ragBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
  },

  ragBannerInfo: {
    flex: 1,
    paddingRight: 12,
  },

  ragBannerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },

  ragBannerTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },

  ragBannerEnd: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  sourcesContainer: {
    maxWidth: "92%",
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },

  sourcesTitle: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },

  sourceRow: {
    marginBottom: 6,
  },

  sourceName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },

  sourceMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },

  errorContainer: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#B91C1C",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },

  input: {
    flex: 1,

    minHeight: 48,
    maxHeight: 120,

    paddingHorizontal: 16,
    paddingVertical: 12,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    fontSize: 16,
    lineHeight: 21,

    color: colors.text,
    backgroundColor: colors.surface,

    textAlignVertical: "top",

    opacity: 1,
  },

  sendButton: {
    minWidth: 64,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },

  sendButtonDisabled: {
    opacity: 0.45,
  },

  sendButtonPressed: {
    opacity: 0.8,
  },

  sendText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },
});
