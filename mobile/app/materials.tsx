import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { colors } from "../constants/colors";
import {
  deleteDocument,
  getDocuments,
  processDocument,
  uploadDocument,
  type UploadFilePart,
} from "../lib/api";
import { formatDate } from "../lib/format";
import type { StudyDocument } from "../types/data";

function contentTypeFor(asset: DocumentPicker.DocumentPickerAsset): string {
  if (asset.mimeType === "application/pdf") {
    return "application/pdf";
  }

  if (asset.mimeType === "text/plain") {
    return "text/plain";
  }

  const lower = asset.name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".txt")) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function isSupportedFile(asset: DocumentPicker.DocumentPickerAsset): boolean {
  const lower = asset.name.toLowerCase();

  return (
    asset.mimeType === "application/pdf" ||
    asset.mimeType === "text/plain" ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt")
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MaterialsScreen() {
  const router = useRouter();

  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadDocuments(refresh = false) {
    if (refresh) {
      setRefreshing(true);
    } else if (documents.length === 0) {
      setLoading(true);
    }

    try {
      const result = await getDocuments();

      setDocuments(result);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load documents.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDocuments();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePick() {
    if (uploading) {
      return;
    }

    let result: DocumentPicker.DocumentPickerResult;

    try {
      result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (pickError) {
      setError(
        pickError instanceof Error
          ? pickError.message
          : "Could not open files.",
      );

      return;
    }

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];

    if (!isSupportedFile(asset)) {
      Alert.alert("Unsupported file", "Please select a PDF or TXT file.");

      return;
    }

    const filePart: UploadFilePart = {
      uri: asset.uri,
      name: asset.name,
      type: contentTypeFor(asset),
    };

    setUploading(true);
    setError("");

    try {
      const created = await uploadDocument(filePart);

      setDocuments((current) => [created, ...current]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload document.",
      );
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(document: StudyDocument) {
    Alert.alert(
      "Delete document?",
      `"${document.name}" will be permanently removed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(document),
        },
      ],
    );
  }

  async function handleDelete(document: StudyDocument) {
    setDeletingId(document.id);

    try {
      await deleteDocument(document.id);

      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );

      setError("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete document.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleProcess(document: StudyDocument) {
    setProcessingId(document.id);
    setError("");

    try {
      await processDocument(document.id);

      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id ? { ...item, processed: true } : item,
        ),
      );
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : "Failed to process document.",
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <Screen>
      <Header
        title="Study Materials"
        subtitle="Upload PDF and TXT files"
        showBack
      />

      <View style={styles.addRow}>
        <Pressable
          onPress={handlePick}
          disabled={uploading}
          style={({ pressed }) => [
            styles.addButton,
            uploading && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {uploading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />

              <Text style={styles.addButtonText}>Uploading...</Text>
            </>
          ) : (
            <Text style={styles.addButtonText}>＋ Add Material</Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDocuments(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.listState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.listState}>
              <Text style={styles.emptyTitle}>Couldn't load materials</Text>

              <Text style={styles.emptyDescription}>{error}</Text>

              <Pressable
                onPress={() => loadDocuments()}
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
              <Text style={styles.emptyEmoji}>📁</Text>

              <Text style={styles.emptyTitle}>No materials yet</Text>

              <Text style={styles.emptyDescription}>
                Upload a PDF or TXT file to start studying.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.documentRow}>
            <View style={styles.documentInfo}>
              <Text style={styles.documentName} numberOfLines={1}>
                {item.name}
              </Text>

              <Text style={styles.documentMeta}>
                {item.mimeType === "application/pdf" ? "PDF" : "TXT"} ·{" "}
                {formatSize(item.size)}
                {"\n"}
                {formatDate(item.createdAt)}
              </Text>

              {item.processed ? (
                <View style={styles.readyRow}>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyBadgeText}>✔ Ready</Text>
                  </View>

                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/chat",
                        params: {
                          documentId: item.id,
                          title: item.name,
                        },
                      })
                    }
                    disabled={processingId !== null || deletingId !== null}
                    style={({ pressed }) => [
                      styles.askButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.askButtonText}>
                      Ask about this material
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/summarize",
                        params: {
                          documentId: item.id,
                          title: item.name,
                        },
                      })
                    }
                    disabled={processingId !== null || deletingId !== null}
                    style={({ pressed }) => [
                      styles.askButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.askButtonText}>Summarize</Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/quiz",
                        params: {
                          documentId: item.id,
                          title: item.name,
                        },
                      })
                    }
                    disabled={processingId !== null || deletingId !== null}
                    style={({ pressed }) => [
                      styles.askButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.askButtonText}>Generate Quiz</Text>
                  </Pressable>
                </View>
              ) : processingId === item.id ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />

                  <Text style={styles.processingText}>Processing...</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => handleProcess(item)}
                  disabled={processingId !== null || deletingId !== null}
                  style={({ pressed }) => [
                    styles.processButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.processButtonText}>Process</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={() => confirmDelete(item)}
              disabled={deletingId !== null || processingId !== null}
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

const styles = StyleSheet.create({
  addRow: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },

  addButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  buttonPressed: {
    opacity: 0.8,
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

  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },

  documentInfo: {
    flex: 1,
    padding: 16,
  },

  documentName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },

  documentMeta: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  readyBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },

  readyRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },

  askButton: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },

  askButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  readyBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
  },

  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },

  processingText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  processButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },

  processButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
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
});
