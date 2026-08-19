import { useEffect, useState } from "react";
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
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { colors } from "../constants/colors";
import {
  generateQuiz,
  generateRagQuiz,
  getQuiz,
  getQuizzes,
  submitQuizAttempt,
} from "../lib/api";
import { formatDate } from "../lib/format";
import type { Quiz, QuizDifficulty } from "../types/quiz";

type ViewMode = "generator" | "history";

const DIFFICULTIES: {
  value: QuizDifficulty;
  label: string;
}[] = [
  {
    value: "easy",
    label: "Easy",
  },
  {
    value: "medium",
    label: "Medium",
  },
  {
    value: "hard",
    label: "Hard",
  },
];

const QUESTION_COUNTS = [3, 5, 7, 10];

export default function QuizScreen() {
  const [topic, setTopic] = useState("");

  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");

  const [questionCount, setQuestionCount] = useState(5);

  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const [answered, setAnswered] = useState(false);

  const [score, setScore] = useState(0);

  const [finished, setFinished] = useState(false);

  const [mode, setMode] = useState<ViewMode>("generator");

  const params = useLocalSearchParams<{ documentId?: string; title?: string }>();

  const [ragDocument, setRagDocument] = useState<{
    documentId: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    const documentId =
      typeof params.documentId === "string" && params.documentId.length > 0
        ? params.documentId
        : null;

    if (documentId) {
      const title =
        typeof params.title === "string" && params.title.length > 0
          ? params.title
          : "this study material";

      setRagDocument({ documentId, title });
      setTopic(title);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.documentId, params.title]);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [openingId, setOpeningId] = useState<string | null>(null);

  async function loadQuizzes(refresh = false) {
    if (refresh) {
      setRefreshing(true);
    } else {
      setHistoryLoading(true);
    }

    try {
      const result = await getQuizzes();

      setQuizzes(result);
      setHistoryError("");
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error ? loadError.message : "Failed to load quizzes.",
      );
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }

  function goToHistory() {
    setMode("history");
    loadQuizzes();
  }

  async function openQuiz(storedQuiz: Quiz) {
    setOpeningId(storedQuiz.id);
    setHistoryError("");

    try {
      const fullQuiz = await getQuiz(storedQuiz.id);

      setQuiz(fullQuiz);
      setTopic(fullQuiz.topic);
      setDifficulty(fullQuiz.difficulty);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setAnswered(false);
      setScore(0);
      setFinished(false);
      setMode("generator");
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error ? loadError.message : "Failed to open quiz.",
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function handleGenerate() {
    const trimmedTopic = topic.trim();

    if (!ragDocument && trimmedTopic.length < 2) {
      setError("Please enter a topic with at least 2 characters.");

      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const generatedQuiz = ragDocument
        ? await generateRagQuiz(ragDocument.documentId, questionCount, difficulty)
        : await generateQuiz(trimmedTopic, difficulty, questionCount);

      setQuiz(generatedQuiz);

      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setAnswered(false);
      setScore(0);
      setFinished(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSelectAnswer(answerIndex: number) {
    if (answered || !quiz) {
      return;
    }

    setSelectedAnswer(answerIndex);
  }

  function handleCheckAnswer() {
    if (selectedAnswer === null || !quiz || answered) {
      return;
    }

    const currentQuestion = quiz.questions[currentQuestionIndex];

    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    if (isCorrect) {
      setScore((currentScore) => currentScore + 1);
    }

    setAnswered(true);
  }

  function handleNextQuestion() {
    if (!quiz || !answered) {
      return;
    }

    const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;

    if (isLastQuestion) {
      setFinished(true);
      return;
    }

    setCurrentQuestionIndex((currentIndex) => currentIndex + 1);

    setSelectedAnswer(null);
    setAnswered(false);
  }

  function handleRestartQuiz() {
    if (!quiz) {
      return;
    }

    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setAnswered(false);
    setScore(0);
    setFinished(false);
  }

  function handleCreateNewQuiz() {
    setQuiz(null);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setAnswered(false);
    setScore(0);
    setFinished(false);
    setError("");
  }

useEffect(() => {
    if (!finished || !quiz) {
      return;
    }

    submitQuizAttempt(quiz.id, score, quiz.questions.length).catch((error) => {
      console.error("Failed to persist quiz attempt:", error);
    });
  }, [finished, quiz, score]);
  /*
   * -----------------------------------------
   * HISTORY SCREEN
   * -----------------------------------------
   */

  if (mode === "history") {
    return (
      <Screen>
        <Header
          title="Quiz History"
          subtitle="Your generated quizzes"
          onBack={() => setMode("generator")}
          showBack
        />

        <FlatList
          data={quizzes}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadQuizzes(true)}
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
                  onPress={() => loadQuizzes()}
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
                <Text style={styles.emptyEmoji}>🧠</Text>

                <Text style={styles.emptyTitle}>No quizzes yet</Text>

                <Text style={styles.emptyDescription}>
                  Generate a quiz from any topic to build your history.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openQuiz(item)}
              disabled={openingId !== null}
              style={({ pressed }) => [
                styles.quizRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.quizRowInfo}>
                <Text style={styles.quizRowTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <Text style={styles.quizRowMeta}>
                  {item.topic} · {item.difficulty} · {item.questionCount}{" "}
                  questions
                </Text>

                <Text style={styles.quizRowDate}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>

              {openingId === item.id && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </Pressable>
          )}
        />
      </Screen>
    );
  }

  /*
   * -----------------------------------------
   * GENERATOR SCREEN
   * -----------------------------------------
   */

  if (!quiz) {
    return (
      <Screen>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Header
            title="Generate Quiz"
            subtitle="Create a quiz from any topic."
            showBack
          />

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {ragDocument ? (
              <View style={styles.ragSourceBox}>
                <Text style={styles.ragSourceLabel}>📄 Study material</Text>

                <Text style={styles.ragSourceTitle} numberOfLines={2}>
                  {ragDocument.title}
                </Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.label}>Topic</Text>

                <TextInput
                  value={topic}
                  onChangeText={(value) => {
                    setTopic(value);
                    setError("");
                  }}
                  placeholder="e.g. Git, React, biology..."
                  placeholderTextColor={colors.textSecondary}
                  editable={!loading}
                  maxLength={200}
                  style={styles.topicInput}
                />
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.label}>Difficulty</Text>

              <View style={styles.options}>
                {DIFFICULTIES.map((option) => {
                  const selected = difficulty === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setDifficulty(option.value)}
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

            <View style={styles.section}>
              <Text style={styles.label}>Number of questions</Text>

              <View style={styles.options}>
                {QUESTION_COUNTS.map((count) => {
                  const selected = questionCount === count;

                  return (
                    <Pressable
                      key={count}
                      onPress={() => setQuestionCount(count)}
                      disabled={loading}
                      style={[
                        styles.countOption,
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
                        {count}
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
              onPress={handleGenerate}
              disabled={loading || (!ragDocument && !topic.trim())}
              style={({ pressed }) => [
                styles.primaryButton,

                (loading || (!ragDocument && !topic.trim())) &&
                  styles.buttonDisabled,

                pressed && styles.buttonPressed,
              ]}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color={colors.white} />

                  <Text style={styles.buttonText}>Generating...</Text>
                </>
              ) : (
                <Text style={styles.buttonText}>Generate Quiz</Text>
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
              <Text style={styles.historyButtonText}>Quiz History</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  /*
   * -----------------------------------------
   * RESULTS SCREEN
   * -----------------------------------------
   */

  if (finished) {
    const totalQuestions = quiz.questions.length;

    const percentage = Math.round((score / totalQuestions) * 100);

    let resultMessage = "";

    if (percentage === 100) {
      resultMessage = "Perfect score. Excellent work!";
    } else if (percentage >= 80) {
      resultMessage =
        "Great job! You have a strong understanding of the topic.";
    } else if (percentage >= 60) {
      resultMessage = "Good effort. Review the explanations and try again.";
    } else {
      resultMessage = "Keep practicing. Reviewing the concepts will help.";
    }

    return (
      <Screen>
        <Header title="Quiz Complete" subtitle={quiz.title} showBack />

        <ScrollView
          contentContainerStyle={styles.resultsContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>{percentage}%</Text>

            <Text style={styles.scoreLabel}>Score</Text>
          </View>

          <Text style={styles.resultsTitle}>
            {score} / {totalQuestions}
          </Text>

          <Text style={styles.resultsMessage}>{resultMessage}</Text>

          <View style={styles.resultsStats}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{score}</Text>

              <Text style={styles.statLabel}>Correct</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalQuestions - score}</Text>

              <Text style={styles.statLabel}>Incorrect</Text>
            </View>
          </View>

          <Pressable
            onPress={handleRestartQuiz}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>

          <Pressable
            onPress={handleCreateNewQuiz}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Create New Quiz</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  /*
   * -----------------------------------------
   * ACTIVE QUIZ SCREEN
   * -----------------------------------------
   */

  const currentQuestion = quiz.questions[currentQuestionIndex];

  const totalQuestions = quiz.questions.length;

  const progress = (currentQuestionIndex + 1) / totalQuestions;

  const isCorrect =
    answered && selectedAnswer === currentQuestion.correctAnswer;

  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  return (
    <Screen>
      <View style={styles.container}>
        <Header
          title={quiz.title}
          subtitle={`${difficulty} difficulty`}
          showBack
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.quizContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </Text>

            <Text style={styles.progressScore}>Score: {score}</Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                },
              ]}
            />
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionNumber}>
              Question {currentQuestionIndex + 1}
            </Text>

            <Text style={styles.questionText}>{currentQuestion.question}</Text>
          </View>

          <View style={styles.answerList}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;

              const isCorrectOption = currentQuestion.correctAnswer === index;

              let optionStyle: StyleProp<ViewStyle> = styles.answerOption;

              let letterStyle: StyleProp<ViewStyle> = styles.optionLetter;

              let letterTextStyle: StyleProp<TextStyle> =
                styles.optionLetterText;

              if (answered && isCorrectOption) {
                optionStyle = styles.correctOption;

                letterStyle = styles.correctLetter;

                letterTextStyle = styles.correctLetterText;
              } else if (answered && isSelected && !isCorrectOption) {
                optionStyle = styles.incorrectOption;

                letterStyle = styles.incorrectLetter;

                letterTextStyle = styles.incorrectLetterText;
              } else if (!answered && isSelected) {
                optionStyle = styles.selectedAnswerOption;

                letterStyle = styles.selectedLetter;

                letterTextStyle = styles.selectedLetterText;
              }

              return (
                <Pressable
                  key={index}
                  onPress={() => handleSelectAnswer(index)}
                  disabled={answered}
                  style={optionStyle}
                >
                  <View style={letterStyle}>
                    <Text style={letterTextStyle}>
                      {String.fromCharCode(65 + index)}
                    </Text>
                  </View>

                  <Text style={styles.answerText}>{option}</Text>
                </Pressable>
              );
            })}
          </View>

          {answered && (
            <View
              style={[
                styles.feedbackContainer,
                isCorrect ? styles.correctFeedback : styles.incorrectFeedback,
              ]}
            >
              <Text
                style={[
                  styles.feedbackTitle,
                  isCorrect
                    ? styles.correctFeedbackTitle
                    : styles.incorrectFeedbackTitle,
                ]}
              >
                {isCorrect ? "Correct!" : "Not quite"}
              </Text>

              {!isCorrect && (
                <Text style={styles.correctAnswerText}>
                  Correct answer:{" "}
                  {currentQuestion.options[currentQuestion.correctAnswer]}
                </Text>
              )}

              <Text style={styles.explanationText}>
                {currentQuestion.explanation}
              </Text>
            </View>
          )}

          {!answered ? (
            <Pressable
              onPress={handleCheckAnswer}
              disabled={selectedAnswer === null}
              style={({ pressed }) => [
                styles.primaryButton,

                selectedAnswer === null && styles.buttonDisabled,

                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Check Answer</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNextQuestion}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>
                {isLastQuestion ? "See Results" : "Next Question"}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
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

  quizRow: {
    flexDirection: "row",
    alignItems: "center",
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

  quizRowInfo: {
    flex: 1,
  },

  quizRowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },

  quizRowMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
  },

  quizRowDate: {
    marginTop: 2,
    fontSize: 12,
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

  scrollView: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 26,
  },

  label: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  topicInput: {
    minHeight: 52,
    paddingHorizontal: 16,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    fontSize: 15,
    color: colors.text,

    backgroundColor: colors.surface,
  },

  ragSourceBox: {
    marginBottom: 26,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
  },

  ragSourceLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },

  ragSourceTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },

  options: {
    flexDirection: "row",
    gap: 8,
  },

  option: {
    flex: 1,
    minHeight: 46,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 10,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,

    backgroundColor: colors.background,
  },

  countOption: {
    flex: 1,
    minHeight: 46,

    alignItems: "center",
    justifyContent: "center",

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
    fontSize: 14,
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

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,

    minHeight: 52,

    marginTop: 8,

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

  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",

    minHeight: 52,

    marginTop: 12,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    backgroundColor: colors.surface,
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },

  quizContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    marginBottom: 10,
  },

  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  progressScore: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  progressTrack: {
    height: 7,

    marginBottom: 24,

    overflow: "hidden",

    borderRadius: 999,

    backgroundColor: colors.border,
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },

  questionCard: {
    marginBottom: 20,
    padding: 20,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,

    backgroundColor: colors.surface,
  },

  questionNumber: {
    marginBottom: 10,

    fontSize: 13,
    fontWeight: "700",

    color: colors.primary,
  },

  questionText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.text,
  },

  answerList: {
    gap: 10,
    marginBottom: 20,
  },

  answerOption: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 58,

    paddingHorizontal: 14,
    paddingVertical: 12,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,

    backgroundColor: colors.surface,
  },

  selectedAnswerOption: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 58,

    paddingHorizontal: 14,
    paddingVertical: 12,

    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 14,

    backgroundColor: colors.primaryLight,
  },

  correctOption: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 58,

    paddingHorizontal: 14,
    paddingVertical: 12,

    borderWidth: 2,
    borderColor: "#16A34A",
    borderRadius: 14,

    backgroundColor: "#F0FDF4",
  },

  incorrectOption: {
    flexDirection: "row",
    alignItems: "center",

    minHeight: 58,

    paddingHorizontal: 14,
    paddingVertical: 12,

    borderWidth: 2,
    borderColor: "#DC2626",
    borderRadius: 14,

    backgroundColor: "#FEF2F2",
  },

  optionLetter: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,

    borderRadius: 9,

    backgroundColor: colors.primaryLight,
  },

  selectedLetter: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,

    borderRadius: 9,

    backgroundColor: colors.primary,
  },

  correctLetter: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,

    borderRadius: 9,

    backgroundColor: "#16A34A",
  },

  incorrectLetter: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,

    borderRadius: 9,

    backgroundColor: "#DC2626",
  },

  optionLetterText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  selectedLetterText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },

  correctLetterText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },

  incorrectLetterText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },

  answerText: {
    flex: 1,

    fontSize: 15,
    lineHeight: 21,

    color: colors.text,
  },

  feedbackContainer: {
    marginBottom: 18,
    padding: 16,

    borderWidth: 1,
    borderRadius: 14,
  },

  correctFeedback: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },

  incorrectFeedback: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },

  feedbackTitle: {
    marginBottom: 8,

    fontSize: 17,
    fontWeight: "800",
  },

  correctFeedbackTitle: {
    color: "#15803D",
  },

  incorrectFeedbackTitle: {
    color: "#B91C1C",
  },

  correctAnswerText: {
    marginBottom: 8,

    fontSize: 14,
    lineHeight: 20,

    fontWeight: "600",

    color: "#B91C1C",
  },

  explanationText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },

  resultsContent: {
    alignItems: "center",

    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
  },

  scoreCircle: {
    width: 170,
    height: 170,

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 24,

    borderWidth: 8,
    borderColor: colors.primary,
    borderRadius: 999,

    backgroundColor: colors.surface,
  },

  scoreNumber: {
    fontSize: 42,
    fontWeight: "800",
    color: colors.primary,
  },

  scoreLabel: {
    marginTop: 2,

    fontSize: 13,
    fontWeight: "600",

    color: colors.textSecondary,
  },

  resultsTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },

  resultsMessage: {
    maxWidth: 320,

    marginTop: 10,

    textAlign: "center",

    fontSize: 15,
    lineHeight: 22,

    color: colors.textSecondary,
  },

  resultsStats: {
    flexDirection: "row",

    width: "100%",

    gap: 12,

    marginTop: 28,
    marginBottom: 24,
  },

  statCard: {
    flex: 1,

    alignItems: "center",

    paddingVertical: 18,

    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,

    backgroundColor: colors.surface,
  },

  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },

  statLabel: {
    marginTop: 4,

    fontSize: 13,

    color: colors.textSecondary,
  },
});
