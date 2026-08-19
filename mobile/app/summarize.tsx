import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
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
import { getSummaries, streamSummary, streamRagSummary } from "../lib/api";
import { formatDate } from "../lib/format";
import type { SummaryRecord } from "../types/data";

type SummaryLength = "short" | "medium" | "detailed";

type ViewMode = "form" | "history" | "detail";

const SUMMARY_OPTIONS: {
  value: SummaryLength;
  label: string;
}[] = [
  {
    value: "short",
    label: "Short",
  },
  {
    value: "medium",
    label: "Medium",
  },
  {
    value: "detailed",
    label: "Detailed",
  },
];

const MAX_CHARACTERS = 20000;

function summaryPreview(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();

  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;
}

export default function SummarizeScreen() {
  const [text, setText] = useState("");

  const [summary, setSummary] = useState("");

  const [length, setLength] = useState<SummaryLength>("medium");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const summaryScrollRef = useRef<ScrollView>(null);

  const [mode, setMode] = useState<ViewMode>("form");

  const [summaries, setSummaries] = useState<SummaryRecord[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [selectedSummary, setSelectedSummary] =
    useState<SummaryRecord | null>(null);

  async function loadSummaries(refresh = false) {
    if (refresh) {
      setRefreshing(true);
    } else {
      setHistoryLoading(true);
    }

    try {
      const result = await getSummaries();

      setSummaries(result);
      setHistoryError("");
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load summaries.",
      );
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }

  function goToHistory() {
    setMode("history");
    loadSummaries();
  }

  function openSummary(item: SummaryRecord) {
    setSelectedSummary(item);
    setMode("detail");
  }

  const params = useLocalSearchParams<{ documentId?: string; title?: string }>();

  const [ragDocument, setRagDocument] = useState<{
    documentId: string;
    title: string;
  } | null>(null);

  const ragStartedRef = useRef(false);

  useEffect(() => {
    const documentId =
      typeof params.documentId === "string" && params.documentId.length > 0
        ? params.documentId
        : null;

    if (documentId) {
      setRagDocument({
        documentId,
        title:
          typeof params.title === "string" && params.title.length > 0
            ? params.title
            : "this study material",
      });

      setSummary("");
      setText("");
      setError("");
      ragStartedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.documentId, params.title]);

  useEffect(() => {
    if (!ragDocument || ragStartedRef.current) {
      return;
    }

    ragStartedRef.current = true;

    handleRagSummarize(ragDocument.documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ragDocument]);

  async function handleRagSummarize(documentId: string) {
    setLoading(true);
    setError("");
    setSummary("");

    try {
      await streamRagSummary(documentId, (chunk) => {
        setSummary((currentSummary) => currentSummary + chunk);

        requestAnimationFrame(() => {
          summaryScrollRef.current?.scrollToEnd({ animated: true });
        });
      });
    } catch (summarizeError) {
      setError(
        summarizeError instanceof Error
          ? summarizeError.message
          : "Failed to summarize material.",
      );
    } finally {
      setLoading(false);
    }
  }

  function endRag() {
    setRagDocument(null);
    setSummary("");
    setText("");
    setError("");
    ragStartedRef.current = false;
  }

  async function handleSummarize() {
    const trimmedText = text.trim();

    if (trimmedText.length < 20) {
      setError("Please enter at least 20 characters of study material.");

      return;
    }

    if (loading) {
      return;
    }

    setSummary("");
    setError("");
    setLoading(true);

    try {
      await streamSummary(trimmedText, length, (chunk) => {
        setSummary((currentSummary) => {
          return currentSummary + chunk;
        });

        requestAnimationFrame(() => {
          summaryScrollRef.current?.scrollToEnd({
            animated: true,
          });
        });
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    if (loading) {
      return;
    }

    setText("");
    setSummary("");
    setError("");
  }

  const characterCount = text.length;

  if (ragDocument) {
    return (
      <Screen>
        <Header
          title="RAG Summary"
          subtitle="Summarizing your study material"
          showBack
        />

        <View style={styles.ragBanner}>
          <View style={styles.ragBannerInfo}>
            <Text style={styles.ragBannerLabel}>📄 Study material</Text>

            <Text style={styles.ragBannerTitle} numberOfLines={1}>
              {ragDocument.title}
            </Text>
          </View>

          {!loading && (
            <Pressable onPress={endRag} hitSlop={8}>
              <Text style={styles.ragBannerEnd}>New</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={summaryScrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading && summary.length === 0 ? (
            <View style={styles.ragLoading}>
              <ActivityIndicator size="large" color={colors.primary} />

              <Text style={styles.ragLoadingText}>Summarizing...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {summary.length > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Summary</Text>

              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </Screen>
    );
  }

  if (mode === "history") {
    return (
      <Screen>
        <Header
          title="Summary History"
          subtitle="Your saved summaries"
          onBack={() => setMode("form")}
          showBack
        />

        <FlatList
          data={summaries}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSummaries(true)}
              tintColor={colors.primary}
            />
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
                  onPress={() => loadSummaries()}
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
                <Text style={styles.emptyEmoji}>📝</Text>

                <Text style={styles.emptyTitle}>No summaries yet</Text>

                <Text style={styles.emptyDescription}>
                  Summarize study material to build your history.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openSummary(item)}
              style={({ pressed }) => [
                styles.summaryRow,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={styles.summaryRowTitle} numberOfLines={1}>
                {summaryPreview(item.summary)}
              </Text>

              <Text style={styles.summaryRowMeta}>
                {formatDate(item.createdAt)} · {item.length}
              </Text>
            </Pressable>
          )}
        />
      </Screen>
    );
  }

  if (mode === "detail" && selectedSummary) {
    return (
      <Screen>
        <Header
          title="Saved Summary"
          onBack={() => setMode("history")}
          showBack
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.detailMeta}>
            {formatDate(selectedSummary.createdAt)} · {selectedSummary.length}
          </Text>

          <Text style={styles.detailLabel}>Summary</Text>

          <Text style={styles.detailBody}>{selectedSummary.summary}</Text>

          <Text style={styles.detailLabel}>Source text</Text>

          <Text style={styles.detailBody}>{selectedSummary.sourceText}</Text>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Header
          title="Summarize"
          subtitle="Turn study material into concise notes."
          showBack
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Your study material</Text>

              {text.length > 0 && (
                <Pressable onPress={handleClear} disabled={loading}>
                  <Text
                    style={[styles.clearText, loading && styles.disabledText]}
                  >
                    Clear
                  </Text>
                </Pressable>
              )}
            </View>

            <TextInput
              value={text}
              onChangeText={(value) => {
                if (value.length <= MAX_CHARACTERS) {
                  setText(value);
                  setError("");
                }
              }}
              placeholder="Paste your study material here..."
              placeholderTextColor={colors.textSecondary}
              multiline
              editable={!loading}
              textAlignVertical="top"
              style={styles.textInput}
            />

            <View style={styles.characterRow}>
              <Text style={styles.characterText}>
                {characterCount.toLocaleString()} /{" "}
                {MAX_CHARACTERS.toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Summary length</Text>

            <View style={styles.options}>
              {SUMMARY_OPTIONS.map((option) => {
                const selected = length === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setLength(option.value)}
                    disabled={loading}
                    style={[
                      styles.option,
                      selected && styles.optionSelected,
                      loading && styles.optionDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && styles.optionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSummarize}
            disabled={!text.trim() || loading}
            style={({ pressed }) => [
              styles.summarizeButton,

              (!text.trim() || loading) && styles.buttonDisabled,

              pressed && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color={colors.white} />

                <Text style={styles.buttonText}>Summarizing...</Text>
              </>
            ) : (
              <Text style={styles.buttonText}>Summarize</Text>
            )}
          </Pressable>

          <Pressable
            onPress={goToHistory}
            disabled={loading}
            style={({ pressed }) => [
              styles.historyButton,
              loading && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.historyButtonText}>Summary History</Text>
          </Pressable>

          {summary.length > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Summary</Text>

              <ScrollView
                ref={summaryScrollRef}
                style={styles.summaryBox}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.summaryText}>{summary}</Text>

                {loading && (
                  <View style={styles.streamingIndicator}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  historyButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },

  historyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
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

  emptyEmoji: {
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

  summaryRow: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },

  rowPressed: {
    opacity: 0.7,
    backgroundColor: colors.surface,
  },

  summaryRowTitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },

  summaryRowMeta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
  },

  detailContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  detailMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  detailLabel: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  detailBody: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
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

  scrollView: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  ragBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 16,
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

  ragLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },

  ragLoadingText: {
    fontSize: 15,
    color: colors.textSecondary,
  },

  section: {
    marginBottom: 28,
  },

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  clearText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },

  disabledText: {
    opacity: 0.4,
  },

  textInput: {
    minHeight: 220,
    maxHeight: 400,

    paddingHorizontal: 16,
    paddingVertical: 16,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,

    fontSize: 15,
    lineHeight: 22,
    color: colors.text,

    backgroundColor: colors.surface,
  },

  characterRow: {
    alignItems: "flex-end",
    marginTop: 6,
  },

  characterText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  options: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  option: {
    flex: 1,

    alignItems: "center",
    justifyContent: "center",

    minHeight: 44,

    paddingHorizontal: 10,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,

    backgroundColor: colors.background,
  },

  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },

  optionDisabled: {
    opacity: 0.5,
  },

  optionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  optionTextSelected: {
    color: colors.primary,
  },

  errorContainer: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#B91C1C",
  },

  summarizeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,

    minHeight: 52,

    borderRadius: 16,

    backgroundColor: colors.primary,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },

  summarySection: {
    marginTop: 32,
  },

  summaryTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },

  summaryBox: {
    maxHeight: 420,

    padding: 18,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,

    backgroundColor: colors.surface,
  },

  summaryText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },

  streamingIndicator: {
    marginTop: 12,
  },
});
